import crypto from 'crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { EnginePolicy } from '@/lib/engine/offer';

const SESSION_COOKIE_NAME = 'rg_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'returngate-dev-secret-key-at-least-32-chars';

export interface WorkspaceOrder {
	id: string;
	workspaceId: string;
	paypalOrderId: string;
	captureId: string;
	amountCents: number;
	currency: string;
	status: string;
	itemTitle: string;
	itemSku: string;
	createdAt: Date;
}

export interface WorkspaceCase {
	id: string;
	orderId: string;
	nonce: string;
	nonceExpiresAt: Date;
	nonceUsedAt?: Date | null;
	status: string;
	imageSha256?: string | null;
	visionJson?: VisionOutput | null;
	decision?: string | null;
	offerCents?: number | null;
	decidedBy?: string | null;
	createdAt: Date;
	refunds?: WorkspaceRefund[];
	order?: WorkspaceOrder;
}

export interface WorkspaceRefund {
	id: string;
	caseId: string;
	idempotencyKey: string;
	paypalRefundId?: string | null;
	amountCents: number;
	status: string;
	createdAt: Date;
	confirmedAt?: Date | null;
}

export interface WorkspaceData {
	id: string;
	createdAt: Date;
	expiresAt: Date;
	policy: EnginePolicy & { id?: string; workspaceId: string; enabled: boolean };
	orders: WorkspaceOrder[];
	cases: WorkspaceCase[];
	refunds: WorkspaceRefund[];
}

// In-memory store fallback for judge/sandbox mode when DB connection is local or ephemeral
const inMemoryWorkspaces = new Map<string, WorkspaceData>();

export function signWorkspaceId(workspaceId: string): string {
	const hmac = crypto.createHmac('sha256', SESSION_SECRET);
	hmac.update(workspaceId);
	const signature = hmac.digest('hex');
	return `${workspaceId}.${signature}`;
}

export function verifyWorkspaceId(signedValue: string): string | null {
	const parts = signedValue.split('.');
	if (parts.length !== 2) return null;
	const [workspaceId, signature] = parts;
	const hmac = crypto.createHmac('sha256', SESSION_SECRET);
	hmac.update(workspaceId);
	const expectedSignature = hmac.digest('hex');

	if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
		return workspaceId;
	}
	return null;
}

export function createDefaultSeedData(workspaceId: string): WorkspaceData {
	const now = new Date();
	const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 60 minutes expiry

	const policy = {
		workspaceId,
		capCents: 2500, // $25.00
		minorPercent: 20, // 20%
		salvageCents: 0,
		returnShippingCents: 600, // $6.00
		handlingCents: 200, // $2.00
		minSavingsCents: 300, // $3.00
		minConfidence: 0.8,
		enabled: true,
	};

	const orders: WorkspaceOrder[] = [
		{
			id: `order-101-${workspaceId.slice(0, 6)}`,
			workspaceId,
			paypalOrderId: '8AA1234567890123A',
			captureId: `CAP-DEMO-8500-${workspaceId.slice(0, 4)}`,
			amountCents: 8500, // $85.00
			currency: 'USD',
			status: 'COMPLETED',
			itemTitle: 'Wireless Noise-Cancelling Headphones',
			itemSku: 'AUDIO-ANC-01',
			createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
		},
		{
			id: `order-102-${workspaceId.slice(0, 6)}`,
			workspaceId,
			paypalOrderId: '9BB9876543210987B',
			captureId: `CAP-DEMO-12000-${workspaceId.slice(0, 4)}`,
			amountCents: 12000, // $120.00
			currency: 'USD',
			status: 'COMPLETED',
			itemTitle: 'Minimalist Aluminum Desk Lamp',
			itemSku: 'HOME-LAMP-ALUM',
			createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
		},
		{
			id: `order-103-${workspaceId.slice(0, 6)}`,
			workspaceId,
			paypalOrderId: '7CC4567890123456C',
			captureId: `CAP-DEMO-4500-${workspaceId.slice(0, 4)}`,
			amountCents: 4500, // $45.00
			currency: 'USD',
			status: 'COMPLETED',
			itemTitle: 'Ergonomic Vertical Mouse',
			itemSku: 'PERIPH-MOUSE-02',
			createdAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
		},
	];

	return {
		id: workspaceId,
		createdAt: now,
		expiresAt,
		policy,
		orders,
		cases: [],
		refunds: [],
	};
}

/**
 * Gets or initializes a workspace for the current session.
 */
export async function getOrCreateWorkspace(): Promise<WorkspaceData> {
	let cookieStore: Awaited<ReturnType<typeof cookies>> | undefined;
	try {
		cookieStore = await cookies();
	} catch {
		// Non-request context (e.g., unit test)
	}

	const cookieValue = cookieStore?.get(SESSION_COOKIE_NAME)?.value;
	let workspaceId = cookieValue ? verifyWorkspaceId(cookieValue) : null;

	if (!workspaceId) {
		workspaceId = `ws_${crypto.randomBytes(8).toString('hex')}`;
		if (cookieStore) {
			cookieStore.set(SESSION_COOKIE_NAME, signWorkspaceId(workspaceId), {
				httpOnly: true,
				sameSite: 'lax',
				secure: process.env.NODE_ENV === 'production',
				maxAge: 3600, // 60 minutes
				path: '/',
			});
		}
	}

	// 1. Try DB first if DATABASE_URL exists
	if (process.env.DATABASE_URL) {
		try {
			const dbWorkspace = await prisma.workspace.findUnique({
				where: { id: workspaceId },
				include: {
					merchantPolicy: true,
					orders: {
						include: {
							cases: {
								include: {
									refunds: true,
								},
							},
						},
					},
				},
			});

			if (dbWorkspace) {
				// Check if expired
				if (new Date() > dbWorkspace.expiresAt) {
					// Expired: reset and reseed
					await resetWorkspace(workspaceId);
				} else {
					return {
						id: dbWorkspace.id,
						createdAt: dbWorkspace.createdAt,
						expiresAt: dbWorkspace.expiresAt,
						policy: {
							workspaceId: dbWorkspace.id,
							capCents: dbWorkspace.merchantPolicy?.capCents ?? 2500,
							minorPercent: dbWorkspace.merchantPolicy?.minorPercent ?? 20,
							salvageCents: dbWorkspace.merchantPolicy?.salvageCents ?? 0,
							returnShippingCents: dbWorkspace.merchantPolicy?.returnShippingCents ?? 600,
							handlingCents: dbWorkspace.merchantPolicy?.handlingCents ?? 200,
							minSavingsCents: dbWorkspace.merchantPolicy?.minSavingsCents ?? 300,
							minConfidence: dbWorkspace.merchantPolicy?.minConfidence ?? 0.8,
							enabled: dbWorkspace.merchantPolicy?.enabled ?? true,
						},
						orders: dbWorkspace.orders.map((o) => ({
							id: o.id,
							workspaceId: o.workspaceId,
							paypalOrderId: o.paypalOrderId,
							captureId: o.captureId,
							amountCents: o.amountCents,
							currency: o.currency,
							status: o.status,
							itemTitle: 'Online Store Item',
							itemSku: 'SKU-' + o.captureId.slice(-4),
							createdAt: o.createdAt,
						})),
						cases: dbWorkspace.orders.flatMap((o) =>
							o.cases.map((c) => ({
								id: c.id,
								orderId: c.orderId,
								nonce: c.nonce,
								nonceExpiresAt: c.nonceExpiresAt,
								nonceUsedAt: c.nonceUsedAt,
								status: c.status,
								imageSha256: c.imageSha256,
								visionJson: c.visionJson as unknown as VisionOutput | null,
								decision: c.decision,
								offerCents: c.offerCents,
								decidedBy: c.decidedBy,
								createdAt: c.createdAt,
								refunds: c.refunds.map((r) => ({
									id: r.id,
									caseId: r.caseId,
									idempotencyKey: r.idempotencyKey,
									paypalRefundId: r.paypalRefundId,
									amountCents: r.amountCents,
									status: r.status,
									createdAt: r.createdAt,
									confirmedAt: r.confirmedAt,
								})),
							})),
						),
						refunds: dbWorkspace.orders.flatMap((o) =>
							o.cases.flatMap((c) =>
								c.refunds.map((r) => ({
									id: r.id,
									caseId: r.caseId,
									idempotencyKey: r.idempotencyKey,
									paypalRefundId: r.paypalRefundId,
									amountCents: r.amountCents,
									status: r.status,
									createdAt: r.createdAt,
									confirmedAt: r.confirmedAt,
								})),
							),
						),
					};
				}
			}
		} catch (dbErr) {
			console.warn('[Workspace] DB read fallback to memory store:', dbErr);
		}
	}

	// 2. In-memory store
	let memData = inMemoryWorkspaces.get(workspaceId);
	if (!memData || new Date() > memData.expiresAt) {
		memData = createDefaultSeedData(workspaceId);
		inMemoryWorkspaces.set(workspaceId, memData);
	}

	return memData;
}

/**
 * Resets workspace data to initial seed state.
 */
export async function resetWorkspace(workspaceId?: string): Promise<WorkspaceData> {
	if (!workspaceId) {
		let cookieStore: Awaited<ReturnType<typeof cookies>> | undefined;
		try {
			cookieStore = await cookies();
		} catch {}
		const cookieValue = cookieStore?.get(SESSION_COOKIE_NAME)?.value;
		workspaceId = cookieValue ? verifyWorkspaceId(cookieValue) || undefined : undefined;
	}

	if (!workspaceId) {
		workspaceId = `ws_${crypto.randomBytes(8).toString('hex')}`;
	}

	const seedData = createDefaultSeedData(workspaceId);
	inMemoryWorkspaces.set(workspaceId, seedData);

	if (process.env.DATABASE_URL) {
		try {
			await prisma.returnCase.deleteMany({
				where: { order: { workspaceId } },
			});
			await prisma.order.deleteMany({
				where: { workspaceId },
			});
			await prisma.merchantPolicy.deleteMany({
				where: { workspaceId },
			});
			await prisma.workspace.deleteMany({
				where: { id: workspaceId },
			});

			// Re-create in DB
			await prisma.workspace.create({
				data: {
					id: workspaceId,
					expiresAt: seedData.expiresAt,
					merchantPolicy: {
						create: {
							capCents: seedData.policy.capCents,
							minorPercent: seedData.policy.minorPercent,
							salvageCents: seedData.policy.salvageCents,
							returnShippingCents: seedData.policy.returnShippingCents,
							handlingCents: seedData.policy.handlingCents,
							minSavingsCents: seedData.policy.minSavingsCents,
							minConfidence: seedData.policy.minConfidence,
							enabled: seedData.policy.enabled,
						},
					},
					orders: {
						create: seedData.orders.map((o) => ({
							id: o.id,
							paypalOrderId: o.paypalOrderId,
							captureId: o.captureId,
							amountCents: o.amountCents,
							currency: o.currency,
							status: o.status,
						})),
					},
				},
			});
		} catch (err) {
			console.warn('[Workspace] DB reset warning:', err);
		}
	}

	return seedData;
}

import { generate6DigitNonce, NONCE_EXPIRY_MS } from '@/lib/engine/nonce';
import { evaluateEngineDecision } from '@/lib/engine/offer';
import { generateIdempotencyKey } from '@/lib/engine/executor';
import { VisionOutput } from '@/lib/vision/schema';

export function updateWorkspacePolicy(workspaceId: string, policy: Partial<EnginePolicy>): void {
	const ws = inMemoryWorkspaces.get(workspaceId);
	if (ws) {
		ws.policy = { ...ws.policy, ...policy };
	}
}

export function addWorkspaceCase(workspaceId: string, returnCase: WorkspaceCase): void {
	const ws = inMemoryWorkspaces.get(workspaceId);
	if (ws) {
		ws.cases.unshift(returnCase);
	}
}

export function getCaseById(workspaceId: string, caseId: string): WorkspaceCase | undefined {
	const ws = inMemoryWorkspaces.get(workspaceId);
	return ws?.cases.find((c) => c.id === caseId);
}

export async function createReturnCase(workspaceId: string, orderId: string): Promise<WorkspaceCase> {
	let ws = inMemoryWorkspaces.get(workspaceId);
	if (!ws) {
		ws = createDefaultSeedData(workspaceId);
		inMemoryWorkspaces.set(workspaceId, ws);
	}

	const order = ws.orders.find((o) => o.id === orderId || o.captureId === orderId);
	if (!order) {
		throw new Error(`Order ${orderId} not found in workspace`);
	}

	const caseId = `case_${crypto.randomBytes(6).toString('hex')}`;
	const nonce = generate6DigitNonce();
	const now = new Date();
	const nonceExpiresAt = new Date(now.getTime() + NONCE_EXPIRY_MS);

	const newCase: WorkspaceCase = {
		id: caseId,
		orderId: order.id,
		nonce,
		nonceExpiresAt,
		nonceUsedAt: null,
		status: 'OPEN',
		decision: null,
		offerCents: null,
		decidedBy: null,
		createdAt: now,
		refunds: [],
		order,
	};

	ws.cases.unshift(newCase);
	return newCase;
}

export async function submitCaseEvidence(
	workspaceId: string,
	caseId: string,
	options: {
		sampleType?: 'minor_scratch' | 'major_damage' | 'screen_capture' | 'injected_text';
		visionOutput?: VisionOutput;
	},
): Promise<WorkspaceCase> {
	const ws = inMemoryWorkspaces.get(workspaceId);
	if (!ws) throw new Error('Workspace not found');

	const c = ws.cases.find((item) => item.id === caseId);
	if (!c) throw new Error('Case not found');

	const order = ws.orders.find((o) => o.id === c.orderId);
	if (!order) throw new Error('Order not found');

	const now = new Date();
	const isNonceExpired = now.getTime() > new Date(c.nonceExpiresAt).getTime();
	const isNonceUsed = Boolean(c.nonceUsedAt);
	const isNonceValid = !isNonceExpired && !isNonceUsed;

	let vision: VisionOutput;
	if (options.visionOutput) {
		vision = options.visionOutput;
	} else if (options.sampleType === 'minor_scratch') {
		vision = {
			nonce_visible: true,
			sku_match: true,
			screen_capture_suspected: false,
			injected_text_detected: false,
			defect_class: 'COSMETIC_MINOR',
			confidence: 0.94,
			notes: 'Small 5mm hairline surface scratch. Nonce verified.',
		};
	} else if (options.sampleType === 'major_damage') {
		vision = {
			nonce_visible: true,
			sku_match: true,
			screen_capture_suspected: false,
			injected_text_detected: false,
			defect_class: 'COSMETIC_MAJOR',
			confidence: 0.92,
			notes: 'Large structural fracture across casing. Non-cosmetic.',
		};
	} else if (options.sampleType === 'screen_capture') {
		vision = {
			nonce_visible: true,
			sku_match: true,
			screen_capture_suspected: true,
			injected_text_detected: false,
			defect_class: 'COSMETIC_MINOR',
			confidence: 0.65,
			notes: 'Photo taken of a monitor screen. Screen moire detected.',
		};
	} else if (options.sampleType === 'injected_text') {
		vision = {
			nonce_visible: true,
			sku_match: true,
			screen_capture_suspected: false,
			injected_text_detected: true,
			defect_class: 'COSMETIC_MINOR',
			confidence: 0.6,
			notes: 'Adversarial instruction text detected in background.',
		};
	} else {
		throw new Error('Unsupported evidence sample type');
	}

	const evaluation = evaluateEngineDecision({
		capturedCents: order.amountCents,
		remainingRefundableCents: order.amountCents,
		policy: ws.policy,
		vision,
		isNonceValid,
	});

	c.visionJson = vision;
	c.decision = evaluation.decision;
	c.status = evaluation.decision;
	c.offerCents = evaluation.offerCents;
	c.decidedBy = 'RETURN_GATE_ENGINE_V1';

	if (evaluation.decision === 'AUTO_OFFER') {
		c.nonceUsedAt = new Date();
	}

	return c;
}

export async function acceptCaseOffer(
	workspaceId: string,
	caseId: string,
): Promise<WorkspaceRefund> {
	const ws = inMemoryWorkspaces.get(workspaceId);
	if (!ws) throw new Error('Workspace not found');

	const c = ws.cases.find((item) => item.id === caseId);
	if (!c) throw new Error('Case not found');
	if (!c.offerCents || c.offerCents <= 0) {
		throw new Error('No active offer available on this case');
	}

	const refundId = `ref_${crypto.randomBytes(6).toString('hex')}`;
	const idempotencyKey = generateIdempotencyKey(caseId, 'KEEP_IT_PARTIAL_REFUND', 1);
	const paypalRefundId = `PAYPAL-REF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

	const refund: WorkspaceRefund = {
		id: refundId,
		caseId,
		idempotencyKey,
		paypalRefundId,
		amountCents: c.offerCents,
		status: 'CONFIRMED',
		createdAt: new Date(),
		confirmedAt: new Date(),
	};

	c.status = 'REFUND_CONFIRMED';
	if (!c.refunds) c.refunds = [];
	c.refunds.push(refund);
	ws.refunds.unshift(refund);

	return refund;
}

export function updateWorkspaceCase(workspaceId: string, caseId: string, updates: Partial<WorkspaceCase>): void {
	const ws = inMemoryWorkspaces.get(workspaceId);
	if (ws) {
		const index = ws.cases.findIndex((c) => c.id === caseId);
		if (index !== -1) {
			ws.cases[index] = { ...ws.cases[index], ...updates };
		}
	}
}

export function addWorkspaceRefund(workspaceId: string, refund: WorkspaceRefund): void {
	const ws = inMemoryWorkspaces.get(workspaceId);
	if (ws) {
		ws.refunds.unshift(refund);
		const c = ws.cases.find((cs) => cs.id === refund.caseId);
		if (c) {
			if (!c.refunds) c.refunds = [];
			c.refunds.push(refund);
		}
	}
}
