import { z } from 'zod';

export class PayPalApiError extends Error {
	public readonly status: number;
	public readonly debugId?: string;
	public readonly details?: unknown;

	constructor({
		name,
		message,
		status,
		debugId,
		details,
	}: {
		name?: string;
		message: string;
		status: number;
		debugId?: string;
		details?: unknown;
	}) {
		super(message);
		this.name = name || 'PayPalApiError';
		this.status = status;
		this.debugId = debugId;
		this.details = details;
	}
}

interface TokenCache {
	accessToken: string;
	expiresAt: number; // unix timestamp in ms
}

let cachedToken: TokenCache | null = null;

export function clearTokenCache(): void {
	cachedToken = null;
}

const tokenResponseSchema = z.object({
	access_token: z.string(),
	token_type: z.string(),
	expires_in: z.number(),
});

export async function getAccessToken({
	apiBase = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com',
	clientId = process.env.PAYPAL_CLIENT_ID || '',
	clientSecret = process.env.PAYPAL_CLIENT_SECRET || '',
	forceRefresh = false,
}: {
	apiBase?: string;
	clientId?: string;
	clientSecret?: string;
	forceRefresh?: boolean;
} = {}): Promise<string> {
	const now = Date.now();

	// Cache token until 60 seconds before expiry
	if (!forceRefresh && cachedToken && cachedToken.expiresAt - now > 60000) {
		return cachedToken.accessToken;
	}

	if (!clientId || !clientSecret) {
		throw new PayPalApiError({
			name: 'CONFIG_ERROR',
			message: 'Missing PayPal client credentials',
			status: 500,
		});
	}

	const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
	const res = await fetch(`${apiBase}/v1/oauth2/token`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${auth}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: 'grant_type=client_credentials',
	});

	if (!res.ok) {
		const text = await res.text();
		throw new PayPalApiError({
			name: 'AUTHENTICATION_FAILURE',
			message: `Failed to authenticate with PayPal: ${res.statusText}`,
			status: res.status,
			details: text,
		});
	}

	const rawJson = await res.json();
	const parsed = tokenResponseSchema.parse(rawJson);

	cachedToken = {
		accessToken: parsed.access_token,
		expiresAt: now + parsed.expires_in * 1000,
	};

	return cachedToken.accessToken;
}

export interface RequestOptions {
	method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
	path: string;
	body?: unknown;
	idempotencyKey?: string;
	mockResponse?: Record<string, unknown>;
	apiBase?: string;
	clientId?: string;
	clientSecret?: string;
}

export async function paypalRequest<T>(
	options: RequestOptions,
	schema?: z.ZodType<T>,
): Promise<T> {
	const apiBase = options.apiBase || process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';
	const token = await getAccessToken({
		apiBase,
		clientId: options.clientId,
		clientSecret: options.clientSecret,
	});

	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`,
		'Content-Type': 'application/json',
		Accept: 'application/json',
	};

	if (options.idempotencyKey) {
		headers['PayPal-Request-Id'] = options.idempotencyKey;
	}

	if (options.mockResponse) {
		headers['PayPal-Mock-Response'] = JSON.stringify(options.mockResponse);
	}

	const url = `${apiBase}${options.path.startsWith('/') ? options.path : `/${options.path}`}`;
	const res = await fetch(url, {
		method: options.method || 'GET',
		headers,
		body: options.body ? JSON.stringify(options.body) : undefined,
	});

	if (!res.ok) {
		let errorJson: { name?: string; message?: string; debug_id?: string; details?: unknown } = {};
		try {
			errorJson = await res.json();
		} catch {
			// Non-JSON response
		}

		throw new PayPalApiError({
			name: errorJson.name || 'PAYPAL_ERROR',
			message: errorJson.message || `PayPal request failed with status ${res.status}`,
			status: res.status,
			debugId: errorJson.debug_id || res.headers.get('Paypal-Debug-Id') || undefined,
			details: errorJson.details || errorJson,
		});
	}

	if (res.status === 204) {
		return {} as T;
	}

	const rawData = await res.json();
	if (schema) {
		return schema.parse(rawData);
	}

	return rawData as T;
}
