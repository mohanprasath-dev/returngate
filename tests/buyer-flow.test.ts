import { describe, it, expect, beforeEach } from 'vitest';
import {
	createReturnCase,
	getCaseById,
	submitCaseEvidence,
	acceptCaseOffer,
	resetWorkspace,
} from '@/lib/workspace';

describe('Buyer Flow (P4.1 & P4.2)', () => {
	const testWsId = 'ws_test_buyer_flow';

	beforeEach(async () => {
		await resetWorkspace(testWsId);
	});

	it('creates a case with 6-digit nonce and 10 minute expiry', async () => {
		const orderId = `order-101-${testWsId.slice(0, 6)}`;
		const newCase = await createReturnCase(testWsId, orderId);

		expect(newCase).toBeDefined();
		expect(newCase.id).toMatch(/^case_/);
		expect(newCase.nonce).toMatch(/^\d{6}$/);
		expect(newCase.status).toBe('OPEN');
		expect(newCase.decision).toBeNull();

		// Expiry should be ~10 minutes from now
		const expiryTime = new Date(newCase.nonceExpiresAt).getTime();
		const now = Date.now();
		const diffMinutes = (expiryTime - now) / (1000 * 60);
		expect(diffMinutes).toBeGreaterThan(9);
		expect(diffMinutes).toBeLessThanOrEqual(10.1);
	});

	it('processes minor cosmetic scratch sample and yields AUTO_OFFER within policy cap', async () => {
		const orderId = `order-101-${testWsId.slice(0, 6)}`;
		const c = await createReturnCase(testWsId, orderId);

		const updated = await submitCaseEvidence(testWsId, c.id, {
			sampleType: 'minor_scratch',
		});

		expect(updated.status).toBe('AUTO_OFFER');
		expect(updated.decision).toBe('AUTO_OFFER');
		expect(updated.offerCents).toBeGreaterThan(0);
		expect(updated.offerCents).toBeLessThanOrEqual(2500); // Merchant cap is $25.00
		expect(updated.visionJson?.defect_class).toBe('COSMETIC_MINOR');
		expect(updated.visionJson?.confidence).toBeGreaterThanOrEqual(0.8);
	});

	it('routes screen capture anti-spoof evidence to MANUAL_REVIEW with zero auto-offer', async () => {
		const orderId = `order-101-${testWsId.slice(0, 6)}`;
		const c = await createReturnCase(testWsId, orderId);

		const updated = await submitCaseEvidence(testWsId, c.id, {
			sampleType: 'screen_capture',
		});

		expect(updated.status).toBe('MANUAL_REVIEW');
		expect(updated.decision).toBe('MANUAL_REVIEW');
		expect(updated.offerCents).toBe(0);
		expect(updated.visionJson?.screen_capture_suspected).toBe(true);
	});

	it('routes major damage to FULL_RETURN_ONLY', async () => {
		const orderId = `order-101-${testWsId.slice(0, 6)}`;
		const c = await createReturnCase(testWsId, orderId);

		const updated = await submitCaseEvidence(testWsId, c.id, {
			sampleType: 'major_damage',
		});

		expect(updated.status).toBe('FULL_RETURN_ONLY');
		expect(updated.decision).toBe('FULL_RETURN_ONLY');
		expect(updated.offerCents).toBe(0);
	});

	it('accepts AUTO_OFFER and executes deterministic refund', async () => {
		const orderId = `order-101-${testWsId.slice(0, 6)}`;
		const c = await createReturnCase(testWsId, orderId);

		await submitCaseEvidence(testWsId, c.id, {
			sampleType: 'minor_scratch',
		});

		const result = await acceptCaseOffer(testWsId, c.id);

		expect(result.status).toBe('CONFIRMED');
		expect(result.paypalRefundId).toBeDefined();
		expect(result.idempotencyKey).toBeDefined();
		expect(result.amountCents).toBeGreaterThan(0);

		// Case should now be REFUND_CONFIRMED
		const resolvedCase = await getCaseById(testWsId, c.id);
		expect(resolvedCase?.status).toBe('REFUND_CONFIRMED');
	});
});
