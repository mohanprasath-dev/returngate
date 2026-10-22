import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { generate6DigitNonce, NONCE_EXPIRY_MS } from '@/lib/engine/nonce';
import {
	getOrCreateWorkspace,
	addWorkspaceCase,
	WorkspaceCase,
} from '@/lib/workspace';

export async function GET() {
	try {
		const workspace = await getOrCreateWorkspace();
		return NextResponse.json({ cases: workspace.cases });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { orderId } = body;

		if (!orderId) {
			return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
		}

		const workspace = await getOrCreateWorkspace();
		const order = workspace.orders.find((o) => o.id === orderId || o.captureId === orderId);

		if (!order) {
			return NextResponse.json({ error: `Order ${orderId} not found in workspace` }, { status: 404 });
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

		// Save in-memory
		addWorkspaceCase(workspace.id, newCase);

		// Try DB if configured
		if (process.env.DATABASE_URL) {
			try {
				await prisma.returnCase.create({
					data: {
						id: caseId,
						orderId: order.id,
						nonce,
						nonceExpiresAt,
						status: 'OPEN',
					},
				});
			} catch (dbErr) {
				console.warn('[Cases API] DB write fallback:', dbErr);
			}
		}

		return NextResponse.json({ case: newCase });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
