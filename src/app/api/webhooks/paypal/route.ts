import { NextRequest, NextResponse } from 'next/server';
import { processWebhookEvent, verifyWebhookSignature } from '@/lib/paypal/webhooks';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
	const rawBody = await request.text();

	const transmissionId = request.headers.get('paypal-transmission-id') || '';
	const transmissionTime = request.headers.get('paypal-transmission-time') || '';
	const certUrl = request.headers.get('paypal-cert-url') || '';
	const authAlgo = request.headers.get('paypal-auth-algo') || '';
	const transmissionSig = request.headers.get('paypal-transmission-sig') || '';
	const webhookId = process.env.PAYPAL_WEBHOOK_ID || '';

	if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
		return NextResponse.json(
			{ error: 'Missing PayPal webhook transmission headers' },
			{ status: 400 },
		);
	}

	try {
		const isVerified = await verifyWebhookSignature({
			transmissionId,
			transmissionTime,
			certUrl,
			authAlgo,
			transmissionSig,
			webhookId,
			rawBody,
		});

		if (!isVerified) {
			console.warn('[Webhook] Signature verification status: FAILURE');
			return NextResponse.json(
				{ error: 'PayPal webhook signature verification failed' },
				{ status: 400 },
			);
		}

		let eventData: { id?: string; event_type?: string; resource?: { id?: string } } = {};
		let parsedPayload: unknown;
		try {
			parsedPayload = JSON.parse(rawBody);
			eventData = parsedPayload as { id?: string; event_type?: string; resource?: { id?: string } };
		} catch {
			return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
		}

		if (!eventData.id || !eventData.event_type) {
			return NextResponse.json({ error: 'Event missing id or event_type' }, { status: 400 });
		}

		// Log event id and type only. Never log full payload with PII or secrets.
		console.log(
			`[Webhook Verified SUCCESS] Event ID: ${eventData.id} | Event Type: ${eventData.event_type}`,
		);

		const result = await processWebhookEvent(
			{
				id: eventData.id,
				event_type: eventData.event_type,
				resource: eventData.resource,
			},
			parsedPayload,
		);

		return NextResponse.json({
			received: true,
			duplicate: result.duplicate,
			updatedRefund: result.updatedRefund,
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.error('[Webhook Error]', message);
		return NextResponse.json(
			{ error: 'Internal error processing webhook' },
			{ status: 500 },
		);
	}
}
