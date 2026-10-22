import { z } from 'zod';
import { paypalRequest } from './client';

export const refundResponseSchema = z.object({
	id: z.string(),
	status: z.string(),
	amount: z.object({
		value: z.string(),
		currency_code: z.string(),
	}),
	note_to_payer: z.string().optional(),
	seller_payable_breakdown: z
		.object({
			gross_amount: z.object({ value: z.string(), currency_code: z.string() }).optional(),
			paypal_fee: z.object({ value: z.string(), currency_code: z.string() }).optional(),
			net_amount: z.object({ value: z.string(), currency_code: z.string() }).optional(),
		})
		.optional(),
	create_time: z.string().optional(),
	update_time: z.string().optional(),
});

export type RefundResponse = z.infer<typeof refundResponseSchema>;

export interface RefundCaptureParams {
	captureId: string;
	amountCents: number;
	currency?: string;
	idempotencyKey: string;
	noteToPayer?: string;
	mockResponse?: Record<string, unknown>;
}

export async function refundCapture({
	captureId,
	amountCents,
	currency = 'USD',
	idempotencyKey,
	noteToPayer = 'ReturnGate keep-it partial refund',
	mockResponse,
}: RefundCaptureParams): Promise<RefundResponse> {
	const amountValue = (amountCents / 100).toFixed(2);

	const body = {
		amount: {
			value: amountValue,
			currency_code: currency,
		},
		note_to_payer: noteToPayer,
	};

	return paypalRequest<RefundResponse>(
		{
			method: 'POST',
			path: `/v2/payments/captures/${captureId}/refund`,
			body,
			idempotencyKey,
			mockResponse,
		},
		refundResponseSchema,
	);
}

export async function getRefund(refundId: string): Promise<RefundResponse> {
	return paypalRequest<RefundResponse>(
		{
			method: 'GET',
			path: `/v2/payments/refunds/${refundId}`,
		},
		refundResponseSchema,
	);
}
