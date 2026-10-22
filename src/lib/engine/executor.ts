import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { getCapture } from '@/lib/paypal/orders';
import { refundCapture, RefundResponse } from '@/lib/paypal/refunds';

export const RETURNGATE_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/**
 * Computes deterministic UUIDv5 from caseId + action + revision.
 * Enforces money invariant: every mutating call sends a deterministic PayPal-Request-Id.
 */
export function generateIdempotencyKey(
	caseId: string,
	action = 'KEEP_IT_PARTIAL_REFUND',
	revision = 1,
): string {
	const name = `${caseId}:${action}:${revision}`;
	const hash = crypto
		.createHash('sha1')
		.update(RETURNGATE_NAMESPACE + name)
		.digest('hex');

	// Format as UUIDv5 (8-4-4-4-12)
	const part1 = hash.substring(0, 8);
	const part2 = hash.substring(8, 12);
	const part3 = '5' + hash.substring(13, 16);
	const part4Int = (parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80;
	const part4 = part4Int.toString(16).padStart(2, '0') + hash.substring(18, 20);
	const part5 = hash.substring(20, 32);

	return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

export interface ExecuteRefundParams {
	caseId: string;
	action?: string;
	revision?: number;
	prismaClient?: typeof prisma;
	mockPayPalResponse?: Record<string, unknown>;
	fetchCaptureFn?: typeof getCapture;
	refundCaptureFn?: typeof refundCapture;
}

export interface ExecuteRefundResult {
	refundId: string;
	paypalRefundId?: string | null;
	amountCents: number;
	status: string;
	idempotencyKey: string;
	isReplay: boolean;
}

/**
 * Executes a keep-it partial refund with strict idempotency and DB state management.
 */
export async function executeCaseRefund({
	caseId,
	action = 'KEEP_IT_PARTIAL_REFUND',
	revision = 1,
	prismaClient = prisma,
	mockPayPalResponse,
	fetchCaptureFn = getCapture,
	refundCaptureFn = refundCapture,
}: ExecuteRefundParams): Promise<ExecuteRefundResult> {
	const idempotencyKey = generateIdempotencyKey(caseId, action, revision);

	// 1. Check if a refund record with this idempotency key already exists in DB
	const existingRefund = await prismaClient.refund.findUnique({
		where: { idempotencyKey },
	});

	if (existingRefund && existingRefund.paypalRefundId) {
		console.log(
			`[Refund Executor] Existing refund found for key ${idempotencyKey}. Replaying existing record.`,
		);
		return {
			refundId: existingRefund.id,
			paypalRefundId: existingRefund.paypalRefundId,
			amountCents: existingRefund.amountCents,
			status: existingRefund.status,
			idempotencyKey,
			isReplay: true,
		};
	}

	// 2. Fetch the return case with order details
	const returnCase = await prismaClient.returnCase.findUnique({
		where: { id: caseId },
		include: {
			order: true,
		},
	});

	if (!returnCase) {
		throw new Error(`ReturnCase with ID ${caseId} not found`);
	}

	const order = returnCase.order;
	if (!order || !order.captureId) {
		throw new Error(`Order or captureId missing for case ${caseId}`);
	}

	const offerAmountCents = returnCase.offerCents ?? 0;
	if (offerAmountCents <= 0) {
		throw new Error(`Invalid offer amount (${offerAmountCents}) for case ${caseId}`);
	}

	// 3. Re-check capture state and remaining refundable from PayPal
	let remainingRefundableCents = order.amountCents;
	try {
		const captureDetails = await fetchCaptureFn(order.captureId);
		const captureGross = parseFloat(captureDetails.amount.value) * 100;
		remainingRefundableCents = Math.round(captureGross);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.warn(`[Refund Executor] Could not refresh capture from PayPal: ${message}. Using order amount.`);
	}

	// Clamp to remaining refundable
	const clampedAmountCents = Math.min(offerAmountCents, remainingRefundableCents);
	if (clampedAmountCents <= 0) {
		throw new Error(
			`Clamped refund amount is 0 (offer: ${offerAmountCents}, remaining: ${remainingRefundableCents})`,
		);
	}

	// 4. Create or update PENDING Refund row before calling PayPal
	let refundRecord = existingRefund;
	if (!refundRecord) {
		refundRecord = await prismaClient.refund.create({
			data: {
				caseId,
				idempotencyKey,
				amountCents: clampedAmountCents,
				status: 'PENDING',
			},
		});
	}

	// 5. Call PayPal partial refund with deterministic PayPal-Request-Id
	let paypalRes: RefundResponse;
	try {
		paypalRes = await refundCaptureFn({
			captureId: order.captureId,
			amountCents: clampedAmountCents,
			currency: order.currency || 'USD',
			idempotencyKey,
			noteToPayer: 'ReturnGate keep-it partial refund',
			mockResponse: mockPayPalResponse,
		});
	} catch (err: unknown) {
		// In case of error/timeout, the record remains in PENDING state for deterministic retry
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[Refund Executor] PayPal refund call failed for key ${idempotencyKey}:`, message);
		throw err;
	}

	// 6. Update Refund record to SUBMITTED and link PayPal Refund ID
	const updatedRefund = await prismaClient.refund.update({
		where: { id: refundRecord.id },
		data: {
			paypalRefundId: paypalRes.id,
			status: paypalRes.status === 'COMPLETED' ? 'CONFIRMED' : 'SUBMITTED',
			confirmedAt: paypalRes.status === 'COMPLETED' ? new Date() : null,
		},
	});

	// Update ReturnCase status to RESOLVED_KEEP_IT
	await prismaClient.returnCase.update({
		where: { id: caseId },
		data: {
			status: 'RESOLVED_KEEP_IT',
		},
	});

	return {
		refundId: updatedRefund.id,
		paypalRefundId: updatedRefund.paypalRefundId,
		amountCents: updatedRefund.amountCents,
		status: updatedRefund.status,
		idempotencyKey,
		isReplay: false,
	};
}
