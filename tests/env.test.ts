import { describe, expect, it } from 'vitest';
import { getEnv } from '@/lib/env';

describe('Environment validation', () => {
	it('fails with a clear error naming PAYPAL_CLIENT_ID when missing', () => {
		expect(() => {
			getEnv({
				PAYPAL_ENV: 'sandbox',
				PAYPAL_API_BASE: 'https://api-m.sandbox.paypal.com',
				PAYPAL_CLIENT_SECRET: 'secret',
				PAYPAL_WEBHOOK_ID: 'webhook',
				DATABASE_URL: 'postgres://localhost',
				GEMINI_API_KEY: 'gemini_key',
				GEMINI_MODEL: 'gemini-1.5-flash',
				APP_BASE_URL: 'http://localhost:3000',
				SESSION_SECRET: 'session_secret',
			});
		}).toThrowError(/PAYPAL_CLIENT_ID/);
	});

	it('never logs or leaks secret values in error output', () => {
		try {
			getEnv({
				PAYPAL_CLIENT_SECRET: 'super-sensitive-secret-value-12345',
			});
		} catch (error: any) {
			expect(error.message).not.toContain('super-sensitive-secret-value-12345');
		}
	});

	it('succeeds when all required variables are present', () => {
		const valid = getEnv({
			PAYPAL_ENV: 'sandbox',
			PAYPAL_API_BASE: 'https://api-m.sandbox.paypal.com',
			PAYPAL_CLIENT_ID: 'client_id',
			PAYPAL_CLIENT_SECRET: 'secret',
			PAYPAL_WEBHOOK_ID: 'webhook',
			DATABASE_URL: 'postgres://localhost',
			GEMINI_API_KEY: 'gemini_key',
			GEMINI_MODEL: 'gemini-1.5-flash',
			APP_BASE_URL: 'http://localhost:3000',
			SESSION_SECRET: 'session_secret',
			VISION_DAILY_CAP: '250',
			VISION_PER_IP_HOURLY: '10',
			WORKSPACE_REFUND_CAP_CENTS: '5000',
		});

		expect(valid.PAYPAL_CLIENT_ID).toBe('client_id');
		expect(valid.VISION_DAILY_CAP).toBe(250);
	});
});
