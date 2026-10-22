import { describe, expect, it, vi } from 'vitest';
import { verifyWebhookSignature } from '@/lib/paypal/webhooks';

describe('PayPal Webhook Signature Verification', () => {
	it('returns false when raw body is invalid JSON', async () => {
		const result = await verifyWebhookSignature({
			transmissionId: 'trans-123',
			transmissionTime: '2026-10-22T10:00:00Z',
			certUrl: 'https://api.sandbox.paypal.com/cert',
			authAlgo: 'SHA256withRSA',
			transmissionSig: 'sig123',
			webhookId: 'hook-123',
			rawBody: 'invalid-non-json-body',
			clientId: 'mock_client',
			clientSecret: 'mock_secret',
		});

		expect(result).toBe(false);
	});

	it('returns true when PayPal verification returns SUCCESS', async () => {
		const mockFetch = vi.fn().mockImplementation((url: string) => {
			if (url.includes('/v1/oauth2/token')) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ access_token: 'mock_access_token' }),
				});
			}
			if (url.includes('/v1/notifications/verify-webhook-signature')) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ verification_status: 'SUCCESS' }),
				});
			}
			return Promise.reject(new Error(`Unexpected url: ${url}`));
		});

		vi.stubGlobal('fetch', mockFetch);

		const result = await verifyWebhookSignature({
			transmissionId: 'trans-123',
			transmissionTime: '2026-10-22T10:00:00Z',
			certUrl: 'https://api.sandbox.paypal.com/cert',
			authAlgo: 'SHA256withRSA',
			transmissionSig: 'sig123',
			webhookId: 'hook-123',
			rawBody: JSON.stringify({ id: 'EVT-123', event_type: 'PAYMENT.CAPTURE.REFUNDED' }),
			clientId: 'mock_client',
			clientSecret: 'mock_secret',
		});

		expect(result).toBe(true);
		expect(mockFetch).toHaveBeenCalledTimes(2);

		vi.unstubAllGlobals();
	});

	it('returns false when PayPal verification returns FAILURE (e.g. simulator or tampered)', async () => {
		const mockFetch = vi.fn().mockImplementation((url: string) => {
			if (url.includes('/v1/oauth2/token')) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ access_token: 'mock_access_token' }),
				});
			}
			if (url.includes('/v1/notifications/verify-webhook-signature')) {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ verification_status: 'FAILURE' }),
				});
			}
			return Promise.reject(new Error(`Unexpected url: ${url}`));
		});

		vi.stubGlobal('fetch', mockFetch);

		const result = await verifyWebhookSignature({
			transmissionId: 'simulated-id',
			transmissionTime: '2026-10-22T10:00:00Z',
			certUrl: 'https://api.sandbox.paypal.com/cert',
			authAlgo: 'SHA256withRSA',
			transmissionSig: 'invalid-sig',
			webhookId: 'hook-123',
			rawBody: JSON.stringify({ id: 'SIMULATED-EVENT', event_type: 'PAYMENT.CAPTURE.REFUNDED' }),
			clientId: 'mock_client',
			clientSecret: 'mock_secret',
		});

		expect(result).toBe(false);

		vi.unstubAllGlobals();
	});
});
