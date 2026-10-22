import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTokenCache, getAccessToken, PayPalApiError, paypalRequest } from '@/lib/paypal/client';
import { captureOrder, createOrder } from '@/lib/paypal/orders';
import { refundCapture } from '@/lib/paypal/refunds';

describe('Typed PayPal Client', () => {
	beforeEach(() => {
		process.env.PAYPAL_CLIENT_ID = 'test_client_id';
		process.env.PAYPAL_CLIENT_SECRET = 'test_client_secret';
		process.env.PAYPAL_API_BASE = 'https://api-m.sandbox.paypal.com';
		clearTokenCache();
		vi.restoreAllMocks();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('authenticates and caches OAuth token until expiry', async () => {
		let tokenCallCount = 0;
		const mockFetch = vi.fn().mockImplementation((url: string) => {
			if (url.includes('/v1/oauth2/token')) {
				tokenCallCount++;
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () =>
						Promise.resolve({
							access_token: `token_${tokenCallCount}`,
							token_type: 'Bearer',
							expires_in: 3600,
						}),
				});
			}
			return Promise.reject(new Error(`Unexpected call to ${url}`));
		});

		vi.stubGlobal('fetch', mockFetch);

		const token1 = await getAccessToken({
			clientId: 'client_id',
			clientSecret: 'client_secret',
		});
		expect(token1).toBe('token_1');
		expect(tokenCallCount).toBe(1);

		// Second call before expiry uses cached token
		const token2 = await getAccessToken({
			clientId: 'client_id',
			clientSecret: 'client_secret',
		});
		expect(token2).toBe('token_1');
		expect(tokenCallCount).toBe(1);

		// Force refresh triggers a new fetch
		const token3 = await getAccessToken({
			clientId: 'client_id',
			clientSecret: 'client_secret',
			forceRefresh: true,
		});
		expect(token3).toBe('token_2');
		expect(tokenCallCount).toBe(2);
	});

	it('creates an order and captures it successfully with idempotency key', async () => {
		const capturedHeaders: HeadersInit[] = [];

		const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
			if (url.includes('/v1/oauth2/token')) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () =>
						Promise.resolve({
							access_token: 'valid_access_token',
							token_type: 'Bearer',
							expires_in: 3600,
						}),
				});
			}

			if (init?.headers) {
				capturedHeaders.push(init.headers);
			}

			if (url.includes('/v2/checkout/orders/ORDER-123/capture')) {
				return Promise.resolve({
					ok: true,
					status: 201,
					json: () =>
						Promise.resolve({
							id: 'ORDER-123',
							status: 'COMPLETED',
							purchase_units: [
								{
									payments: {
										captures: [
											{
												id: 'CAPTURE-123',
												status: 'COMPLETED',
												amount: { currency_code: 'USD', value: '10.00' },
											},
										],
									},
								},
							],
						}),
				});
			}

			if (url.includes('/v2/checkout/orders')) {
				return Promise.resolve({
					ok: true,
					status: 201,
					json: () =>
						Promise.resolve({
							id: 'ORDER-123',
							status: 'CREATED',
							links: [
								{ href: 'https://paypal.com/checkout?token=123', rel: 'approve' },
							],
						}),
				});
			}

			return Promise.reject(new Error(`Unexpected URL: ${url}`));
		});

		vi.stubGlobal('fetch', mockFetch);

		const order = await createOrder({
			amountCents: 1000,
			idempotencyKey: 'idemp-order-1',
		});
		expect(order.id).toBe('ORDER-123');
		expect(order.status).toBe('CREATED');

		const capture = await captureOrder('ORDER-123', 'idemp-capture-1');
		expect(capture.id).toBe('ORDER-123');
		expect(capture.status).toBe('COMPLETED');
	});

	it('maps 422 REFUND_AMOUNT_EXCEEDED error to a typed PayPalApiError', async () => {
		const mockFetch = vi.fn().mockImplementation((url: string) => {
			if (url.includes('/v1/oauth2/token')) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () =>
						Promise.resolve({
							access_token: 'valid_access_token',
							token_type: 'Bearer',
							expires_in: 3600,
						}),
				});
			}

			if (url.includes('/refund')) {
				return Promise.resolve({
					ok: false,
					status: 422,
					headers: new Headers({
						'Paypal-Debug-Id': 'debug_ref_422',
					}),
					json: () =>
						Promise.resolve({
							name: 'UNPROCESSABLE_ENTITY',
							message: 'The requested refund amount exceeds the remaining refundable amount.',
							debug_id: 'debug_ref_422',
							details: [
								{
									issue: 'REFUND_AMOUNT_EXCEEDED',
									description: 'The capture has already been refunded.',
								},
							],
						}),
				});
			}

			return Promise.reject(new Error(`Unexpected URL: ${url}`));
		});

		vi.stubGlobal('fetch', mockFetch);

		await expect(
			refundCapture({
				captureId: 'CAPTURE-EXCEEDED',
				amountCents: 5000,
				idempotencyKey: 'idemp-refund-1',
			}),
		).rejects.toThrow(PayPalApiError);

		try {
			await refundCapture({
				captureId: 'CAPTURE-EXCEEDED',
				amountCents: 5000,
				idempotencyKey: 'idemp-refund-1',
			});
		} catch (error: unknown) {
			expect(error).toBeInstanceOf(PayPalApiError);
			const apiErr = error as PayPalApiError;
			expect(apiErr.status).toBe(422);
			expect(apiErr.name).toBe('UNPROCESSABLE_ENTITY');
			expect(apiErr.debugId).toBe('debug_ref_422');
			expect(apiErr.message).toContain('exceeds the remaining refundable amount');
		}
	});

	it('supports optional PayPal-Mock-Response header for negative test injection', async () => {
		let capturedHeaders: Record<string, string> = {};

		const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
			if (url.includes('/v1/oauth2/token')) {
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () =>
						Promise.resolve({
							access_token: 'valid_access_token',
							token_type: 'Bearer',
							expires_in: 3600,
						}),
				});
			}

			capturedHeaders = init?.headers as Record<string, string>;
			return Promise.resolve({
				ok: true,
				status: 200,
				json: () => Promise.resolve({ success: true }),
			});
		});

		vi.stubGlobal('fetch', mockFetch);

		await paypalRequest({
			method: 'POST',
			path: '/v2/test',
			idempotencyKey: 'custom-idemp',
			mockResponse: {
				mock_application_codes: 'INTERNAL_SERVER_ERROR',
			},
		});

		expect(capturedHeaders['PayPal-Request-Id']).toBe('custom-idemp');
		expect(capturedHeaders['PayPal-Mock-Response']).toBe(
			JSON.stringify({ mock_application_codes: 'INTERNAL_SERVER_ERROR' }),
		);
	});
});
