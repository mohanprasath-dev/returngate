import { describe, expect, it, vi } from 'vitest';
import { pollRefundStatus } from '@/lib/paypal/poll';
import { processWebhookEvent } from '@/lib/paypal/webhooks';

describe('Webhook Persistence, Deduplication, and Polling', () => {
	it('inserts event and updates refund on first receipt, then deduplicates on replay', async () => {
		const createdEvents: Array<{ eventId: string; type: string }> = [];
		let refundUpdateCount = 0;

		const mockPrisma = {
			webhookEvent: {
				create: vi.fn().mockImplementation(({ data }: { data: { eventId: string; type: string } }) => {
					if (createdEvents.some((e) => e.eventId === data.eventId)) {
						const err: any = new Error('Unique constraint failed');
						err.code = 'P2002';
						throw err;
					}
					createdEvents.push(data);
					return Promise.resolve(data);
				}),
			},
			refund: {
				updateMany: vi.fn().mockImplementation(() => {
					refundUpdateCount++;
					return Promise.resolve({ count: 1 });
				}),
			},
		} as any;

		const eventPayload = {
			id: 'WH-EVT-999',
			event_type: 'PAYMENT.CAPTURE.REFUNDED',
			resource: { id: 'REFUND-888' },
		};

		// First receipt
		const res1 = await processWebhookEvent(eventPayload, eventPayload, mockPrisma);
		expect(res1.success).toBe(true);
		expect(res1.duplicate).toBe(false);
		expect(res1.updatedRefund).toBe(true);
		expect(createdEvents.length).toBe(1);
		expect(refundUpdateCount).toBe(1);

		// Replay of the exact same event
		const res2 = await processWebhookEvent(eventPayload, eventPayload, mockPrisma);
		expect(res2.success).toBe(true);
		expect(res2.duplicate).toBe(true);
		expect(res2.updatedRefund).toBe(false);

		// Verified: Exactly one row and one state transition
		expect(createdEvents.length).toBe(1);
		expect(refundUpdateCount).toBe(1);
	});

	it('pollRefundStatus polls PayPal directly and confirms refund state', async () => {
		const mockFetch = vi.fn().mockImplementation((url: string) => {
			if (url.includes('/v1/oauth2/token')) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () =>
						Promise.resolve({
							access_token: 'valid_token',
							token_type: 'Bearer',
							expires_in: 3600,
						}),
				});
			}

			if (url.includes('/v2/payments/refunds/REF-POLL-1')) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () =>
						Promise.resolve({
							id: 'REF-POLL-1',
							status: 'COMPLETED',
							amount: { value: '1.00', currency_code: 'USD' },
						}),
				});
			}

			return Promise.reject(new Error(`Unexpected URL: ${url}`));
		});

		vi.stubGlobal('fetch', mockFetch);

		const pollResult = await pollRefundStatus('REF-POLL-1');
		expect(pollResult.isConfirmed).toBe(true);
		expect(pollResult.refund.id).toBe('REF-POLL-1');
		expect(pollResult.refund.status).toBe('COMPLETED');

		vi.unstubAllGlobals();
	});
});
