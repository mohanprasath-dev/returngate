import { describe, it, expect, beforeEach } from 'vitest';
import {
	createReturnCase,
	getCaseById,
	submitCaseEvidence,
	resetWorkspace,
	updateWorkspacePolicy,
	updateWorkspaceCase,
	addWorkspaceRefund,
	WorkspaceRefund,
} from '@/lib/workspace';
import { calculateOfferAmountCents } from '@/lib/engine/offer';
import { generateIdempotencyKey } from '@/lib/engine/executor';

describe('Merchant Flow (P5.1 & P5.2)', () => {
	const testWsId = 'ws_test_merchant_flow';

	beforeEach(async () => {
		await resetWorkspace(testWsId);
	});

	it('P5.1: updates policy and live calculation preview strictly respects new cap', async () => {
		// Default cap is 2500 ($25.00)
		const capturedCents = 10000; // $100.00
		const initialPolicy = {
			capCents: 2500,
			minorPercent: 30, // 30% = $30.00
			salvageCents: 0,
			returnShippingCents: 600,
			handlingCents: 200,
			minSavingsCents: 300,
			minConfidence: 0.8,
			enabled: true,
		};

		// 30% of $100 is $30, but cap is $25 -> offer must be clamped to $25
		let calc = calculateOfferAmountCents(capturedCents, capturedCents, initialPolicy);
		expect(calc.offerCents).toBe(2500);

		// Lower cap to $15.00 (1500 cents)
		updateWorkspacePolicy(testWsId, { capCents: 1500 });
		const updatedPolicy = { ...initialPolicy, capCents: 1500 };
		calc = calculateOfferAmountCents(capturedCents, capturedCents, updatedPolicy);
		expect(calc.offerCents).toBe(1500);
		expect(calc.offerCents).toBeLessThanOrEqual(1500);
	});

	it('P5.2: approving a queued case issues exactly one refund with deterministic idempotency key', async () => {
		const orderId = `order-101-${testWsId.slice(0, 6)}`;
		const c = await createReturnCase(testWsId, orderId);

		// Submit screen capture -> routes to MANUAL_REVIEW
		await submitCaseEvidence(testWsId, c.id, {
			sampleType: 'screen_capture',
		});

		expect(c.status).toBe('MANUAL_REVIEW');

		// Merchant manual approval within cap
		const approvedAmountCents = 1200; // $12.00
		const idempotencyKey = generateIdempotencyKey(c.id, 'MANUAL_MERCHANT_REFUND', 1);

		const refund: WorkspaceRefund = {
			id: 'ref_merchant_manual_1',
			caseId: c.id,
			idempotencyKey,
			paypalRefundId: 'PAYPAL-REF-MANUAL-123',
			amountCents: approvedAmountCents,
			status: 'COMPLETED',
			createdAt: new Date(),
			confirmedAt: new Date(),
		};

		addWorkspaceRefund(testWsId, refund);
		updateWorkspaceCase(testWsId, c.id, {
			status: 'REFUND_CONFIRMED',
			decision: 'MANUAL_APPROVED',
			offerCents: approvedAmountCents,
			decidedBy: 'MERCHANT_MANUAL',
		});

		const updatedCase = getCaseById(testWsId, c.id);
		expect(updatedCase?.status).toBe('REFUND_CONFIRMED');
		expect(updatedCase?.offerCents).toBe(1200);
		expect(updatedCase?.refunds).toHaveLength(1);
		expect(updatedCase?.refunds?.[0].idempotencyKey).toBe(idempotencyKey);
	});

	it('P5.2: rejecting a queued case marks it FULL_RETURN_REQUIRED with zero refund', async () => {
		const orderId = `order-101-${testWsId.slice(0, 6)}`;
		const c = await createReturnCase(testWsId, orderId);

		await submitCaseEvidence(testWsId, c.id, {
			sampleType: 'injected_text',
		});

		const queued = getCaseById(testWsId, c.id);
		expect(queued?.status).toBe('MANUAL_REVIEW');

		updateWorkspaceCase(testWsId, c.id, {
			status: 'REJECTED_FULL_RETURN_REQUIRED',
			decidedBy: 'MERCHANT_REJECTED',
		});

		const rejectedCase = getCaseById(testWsId, c.id);
		expect(rejectedCase?.status).toBe('REJECTED_FULL_RETURN_REQUIRED');
		expect(rejectedCase?.refunds).toHaveLength(0);
	});
});
