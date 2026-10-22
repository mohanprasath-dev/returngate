import { z } from 'zod';

const envSchema = z.object({
	PAYPAL_ENV: z.enum(['sandbox', 'live']).default('sandbox'),
	PAYPAL_API_BASE: z.string().url().default('https://api-m.sandbox.paypal.com'),
	PAYPAL_CLIENT_ID: z.string().min(1, 'PAYPAL_CLIENT_ID is required'),
	PAYPAL_CLIENT_SECRET: z.string().min(1, 'PAYPAL_CLIENT_SECRET is required'),
	PAYPAL_WEBHOOK_ID: z.string().min(1, 'PAYPAL_WEBHOOK_ID is required'),

	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

	GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
	GEMINI_MODEL: z.string().min(1, 'GEMINI_MODEL is required'),

	APP_BASE_URL: z.string().url().default('http://localhost:3000'),
	SESSION_SECRET: z.string().min(1, 'SESSION_SECRET is required'),

	VISION_DAILY_CAP: z.coerce.number().int().positive().default(250),
	VISION_PER_IP_HOURLY: z.coerce.number().int().positive().default(10),
	WORKSPACE_REFUND_CAP_CENTS: z.coerce.number().int().positive().default(5000),

	NEXT_PUBLIC_SANDBOX_BUYER_EMAIL: z.string().min(1).optional(),
	NEXT_PUBLIC_SANDBOX_BUYER_PASSWORD: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(envInput: Record<string, string | undefined> = process.env): Env {
	const parsed = envSchema.safeParse(envInput);
	if (!parsed.success) {
		const missingOrInvalid = parsed.error.issues.map((issue) => {
			const path = issue.path.join('.');
			return `${path}: ${issue.message}`;
		});
		throw new Error(
			`Invalid environment configuration. Missing or invalid variables:\n${missingOrInvalid.join('\n')}`,
		);
	}
	return parsed.data;
}

let cachedEnv: Env | null = null;

export function getValidatedEnv(envInput?: Record<string, string | undefined>): Env {
	if (envInput) {
		return getEnv(envInput);
	}
	if (!cachedEnv) {
		cachedEnv = getEnv(process.env);
	}
	return cachedEnv;
}

export const env = new Proxy({} as Env, {
	get(_target, prop: string) {
		const validated = getValidatedEnv();
		return validated[prop as keyof Env];
	},
});

