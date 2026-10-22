import { z } from 'zod';
import { paypalRequest } from './client';

export const linkSchema = z.object({
	href: z.string(),
	rel: z.string(),
	method: z.string().optional(),
});

export const orderResponseSchema = z.object({
	id: z.string(),
	status: z.string(),
	links: z.array(linkSchema).optional(),
});

export type OrderResponse = z.infer<typeof orderResponseSchema>;

export const captureDetailSchema = z.object({
	id: z.string(),
	status: z.string(),
	amount: z.object({
		currency_code: z.string(),
		value: z.string(),
	}),
	seller_receivable_breakdown: z
		.object({
			gross_amount: z.object({ value: z.string(), currency_code: z.string() }).optional(),
			paypal_fee: z.object({ value: z.string(), currency_code: z.string() }).optional(),
			net_amount: z.object({ value: z.string(), currency_code: z.string() }).optional(),
		})
		.optional(),
});

export type CaptureDetail = z.infer<typeof captureDetailSchema>;

export const captureOrderResponseSchema = z.object({
	id: z.string(),
	status: z.string(),
	purchase_units: z
		.array(
			z.object({
				payments: z
					.object({
						captures: z.array(captureDetailSchema).optional(),
					})
					.optional(),
			}),
		)
		.optional(),
});

export type CaptureOrderResponse = z.infer<typeof captureOrderResponseSchema>;

export interface CreateOrderParams {
	amountCents: number;
	currency?: string;
	referenceId?: string;
	description?: string;
	idempotencyKey?: string;
	returnUrl?: string;
	cancelUrl?: string;
	mockResponse?: Record<string, unknown>;
}

export async function createOrder({
	amountCents,
	currency = 'USD',
	referenceId = 'unit-1',
	description = 'ReturnGate Order',
	idempotencyKey,
	returnUrl = 'http://localhost:3000/api/paypal/success',
	cancelUrl = 'http://localhost:3000/api/paypal/cancel',
	mockResponse,
}: CreateOrderParams): Promise<OrderResponse> {
	const amountValue = (amountCents / 100).toFixed(2);

	const body = {
		intent: 'CAPTURE',
		purchase_units: [
			{
				reference_id: referenceId,
				description,
				amount: {
					currency_code: currency,
					value: amountValue,
				},
			},
		],
		application_context: {
			return_url: returnUrl,
			cancel_url: cancelUrl,
			user_action: 'PAY_NOW',
		},
	};

	return paypalRequest<OrderResponse>(
		{
			method: 'POST',
			path: '/v2/checkout/orders',
			body,
			idempotencyKey,
			mockResponse,
		},
		orderResponseSchema,
	);
}

export async function captureOrder(
	orderId: string,
	idempotencyKey?: string,
	mockResponse?: Record<string, unknown>,
): Promise<CaptureOrderResponse> {
	return paypalRequest<CaptureOrderResponse>(
		{
			method: 'POST',
			path: `/v2/checkout/orders/${orderId}/capture`,
			idempotencyKey,
			mockResponse,
		},
		captureOrderResponseSchema,
	);
}

export async function getOrder(orderId: string): Promise<OrderResponse> {
	return paypalRequest<OrderResponse>(
		{
			method: 'GET',
			path: `/v2/checkout/orders/${orderId}`,
		},
		orderResponseSchema,
	);
}

export async function getCapture(captureId: string): Promise<CaptureDetail> {
	return paypalRequest<CaptureDetail>(
		{
			method: 'GET',
			path: `/v2/payments/captures/${captureId}`,
		},
		captureDetailSchema,
	);
}
