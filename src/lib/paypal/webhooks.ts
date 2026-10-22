import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

interface VerifyWebhookSignatureParams {
	transmissionId: string;
	transmissionTime: string;
	certUrl: string;
	authAlgo: string;
	transmissionSig: string;
	webhookId: string;
	rawBody: string;
	apiBase?: string;
	clientId?: string;
	clientSecret?: string;
}

interface VerificationApiResponse {
	verification_status: 'SUCCESS' | 'FAILURE';
}

export async function getPayPalOAuthToken(
	apiBase: string,
	clientId: string,
	clientSecret: string,
): Promise<string> {
	const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
	const res = await fetch(`${apiBase}/v1/oauth2/token`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${authHeader}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: 'grant_type=client_credentials',
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Failed to fetch PayPal OAuth token: ${res.status} ${text}`);
	}

	const data = (await res.json()) as { access_token: string };
	return data.access_token;
}

export async function verifyWebhookSignature({
	transmissionId,
	transmissionTime,
	certUrl,
	authAlgo,
	transmissionSig,
	webhookId,
	rawBody,
	apiBase = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com',
	clientId = process.env.PAYPAL_CLIENT_ID || '',
	clientSecret = process.env.PAYPAL_CLIENT_SECRET || '',
}: VerifyWebhookSignatureParams): Promise<boolean> {
	if (!clientId || !clientSecret || !webhookId) {
		throw new Error('Missing PayPal credentials or PAYPAL_WEBHOOK_ID');
	}

	let parsedEvent: unknown;
	try {
		parsedEvent = JSON.parse(rawBody);
	} catch {
		return false;
	}

	const accessToken = await getPayPalOAuthToken(apiBase, clientId, clientSecret);

	const verificationPayload = {
		transmission_id: transmissionId,
		transmission_time: transmissionTime,
		cert_url: certUrl,
		auth_algo: authAlgo,
		transmission_sig: transmissionSig,
		webhook_id: webhookId,
		webhook_event: parsedEvent,
	};

	const res = await fetch(`${apiBase}/v1/notifications/verify-webhook-signature`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(verificationPayload),
	});

	if (!res.ok) {
		return false;
	}

	const data = (await res.json()) as VerificationApiResponse;
	return data.verification_status === 'SUCCESS';
}

export interface WebhookProcessResult {
	success: boolean;
	duplicate: boolean;
	updatedRefund: boolean;
}

export async function processWebhookEvent(
	eventData: { id: string; event_type: string; resource?: { id?: string } },
	rawPayload: unknown,
	prismaClient = prisma,
): Promise<WebhookProcessResult> {
	try {
		await prismaClient.webhookEvent.create({
			data: {
				eventId: eventData.id,
				type: eventData.event_type,
				signatureVerified: true,
				payload: rawPayload as Prisma.InputJsonValue,
			},
		});
	} catch (err: unknown) {
		const isUniqueViolation =
			typeof err === 'object' &&
			err !== null &&
			('code' in err ? (err as { code: string }).code === 'P2002' : false);

		if (isUniqueViolation) {
			console.log(`[Webhook Dedupe] Event ${eventData.id} already processed. Skipping.`);
			return { success: true, duplicate: true, updatedRefund: false };
		}
		throw err;
	}

	let updatedRefund = false;
	if (eventData.event_type === 'PAYMENT.CAPTURE.REFUNDED') {
		const refundId = eventData.resource?.id;
		if (refundId) {
			const updateRes = await prismaClient.refund.updateMany({
				where: { paypalRefundId: refundId },
				data: {
					status: 'CONFIRMED',
					confirmedAt: new Date(),
				},
			});
			updatedRefund = updateRes.count > 0;
			console.log(
				`[Webhook Refund Update] Updated ${updateRes.count} refund rows for refund ${refundId}`,
			);
		}
	}

	return { success: true, duplicate: false, updatedRefund };
}

