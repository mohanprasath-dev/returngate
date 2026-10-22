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
