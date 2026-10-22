import { describe, expect, it, vi } from 'vitest';
import { executeCaseRefund, generateIdempotencyKey } from '@/lib/engine/executor';

describe('Refund Executor (Idempotency and Resilience)', () => {
	it('generates consistent, deterministic UUIDv5 idempotency keys', () => {
		const key1 = generateIdempotencyKey('CASE-101', 'KEEP_IT_PARTIAL_REFUND', 1);
		const key2 = generateIdempotencyKey('CASE-101', 'KEEP_IT_PARTIAL_REFUND', 1);
		const key3 = generateIdempotencyKey('CASE-101', 'KEEP_IT_PARTIAL_REFUND', 2);
		const keyOtherCase = generateIdempotencyKey('CASE-102', 'KEEP_IT_PARTIAL_REFUND', 1);

		expect(key1).toBe(key2);
		expect(key1).not.toBe(key3);
		expect(key1).not.toBe(keyOtherCase);

		// Format: 8-4-4-4-12 hex chars with version 5
		expect(key1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	});

	it('handles dropped first response on retry: second attempt yields exactly one refund', async () => {
		let refundRow: any = null;
		let caseStatus = 'AUTO_OFFER';
		let paypalCallCount = 0;

		const mockPrisma = {
			refund: {
				findUnique: vi.fn().mockImplementation(({ where }: { where: { idempotencyKey: string } }) => {
					if (refundRow && refundRow.idempotencyKey === where.idempotencyKey) {
						return Promise.resolve(refundRow);
					}
					return Promise.resolve(null);
				}),
				create: vi.fn().mockImplementation(({ data }: { data: any }) => {
					refundRow = { id: 'REFUND-DB-1', ...data, paypalRefundId: null };
					return Promise.resolve(refundRow);
				}),
				update: vi.fn().mockImplementation(({ data }: { data: any }) => {
					refundRow = { ...refundRow, ...data };
					return Promise.resolve(refundRow);
				}),
			},
			returnCase: {
				findUnique: vi.fn().mockResolvedValue({
					id: 'CASE-DROP-TEST',
					offerCents: 1500,
					status: 'APPROVED',
					order: {
						captureId: 'CAPTURE-MOCK-999',
						amountCents: 10000,
						currency: 'USD',
					},
				}),
				update: vi.fn().mockImplementation(({ data }: { data: any }) => {
					caseStatus = data.status;
					return Promise.resolve({});
				}),
			},
		} as any;

		// Mocked PayPal refund function that drops the first response
		const mockRefundCapture = vi.fn().mockImplementation(() => {
			paypalCallCount++;
			if (paypalCallCount === 1) {
				throw new Error('ETIMEDOUT: PayPal network connection dropped before response received');
			}
			return Promise.resolve({
				id: 'PAYPAL-REFUND-777',
				status: 'COMPLETED',
				amount: { value: '15.00', currency_code: 'USD' },
			});
		});

		const mockFetchCapture = vi.fn().mockResolvedValue({
			id: 'CAPTURE-MOCK-999',
			status: 'COMPLETED',
			amount: { value: '100.00', currency_code: 'USD' },
		});

		// 1. First attempt: PayPal drops connection
		await expect(
			executeCaseRefund({
				caseId: 'CASE-DROP-TEST',
				prismaClient: mockPrisma,
				fetchCaptureFn: mockFetchCapture,
				refundCaptureFn: mockRefundCapture,
			}),
		).rejects.toThrow('ETIMEDOUT');

		expect(paypalCallCount).toBe(1);
		// Pre-call record exists in PENDING state
		expect(refundRow).toBeDefined();
		expect(refundRow.status).toBe('PENDING');
		expect(refundRow.paypalRefundId).toBeNull();

		// 2. Second attempt: Re-try after timeout
		const result = await executeCaseRefund({
			caseId: 'CASE-DROP-TEST',
			prismaClient: mockPrisma,
			fetchCaptureFn: mockFetchCapture,
			refundCaptureFn: mockRefundCapture,
		});

		expect(paypalCallCount).toBe(2);
		expect(result.paypalRefundId).toBe('PAYPAL-REFUND-777');
		expect(result.status).toBe('CONFIRMED');
		expect(refundRow.paypalRefundId).toBe('PAYPAL-REFUND-777');
		expect(caseStatus).toBe('RESOLVED_KEEP_IT');

		// 3. Third attempt: Replay returns the existing refund without calling PayPal again
		const replayResult = await executeCaseRefund({
			caseId: 'CASE-DROP-TEST',
			prismaClient: mockPrisma,
			fetchCaptureFn: mockFetchCapture,
			refundCaptureFn: mockRefundCapture,
		});

		expect(replayResult.isReplay).toBe(true);
		expect(replayResult.paypalRefundId).toBe('PAYPAL-REFUND-777');
		expect(paypalCallCount).toBe(2); // Still 2, no extra PayPal call made
	});
});
