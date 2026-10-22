import readline from 'readline';

interface OAuthResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
}

interface LinkDescription {
	href: string;
	rel: string;
	method?: string;
}

interface OrderResponse {
	id: string;
	status: string;
	links?: LinkDescription[];
}

interface CaptureResponse {
	id: string;
	status: string;
	purchase_units?: Array<{
		payments?: {
			captures?: Array<{
				id: string;
				status: string;
				amount: {
					currency_code: string;
					value: string;
				};
			}>;
		};
	}>;
}

interface RefundResponse {
	id: string;
	status: string;
	amount?: {
		value: string;
		currency_code: string;
	};
	debug_id?: string;
}

async function promptUser(questionText: string): Promise<string> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question(questionText, (answer) => {
			rl.close();
			resolve(answer);
		});
	});
}

async function runSpike(): Promise<void> {
	console.log('=== ReturnGate PayPal Sandbox Spike (Gate 1) ===');

	const apiBase = process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';
	const clientId = process.env.PAYPAL_CLIENT_ID;
	const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

	if (!clientId || !clientSecret) {
		throw new Error(
			'Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET in environment. Ensure .env is configured.',
		);
	}

	// 1. Get OAuth token
	console.log('\n[1/6] Requesting OAuth token from PayPal sandbox...');
	const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
	const tokenRes = await fetch(`${apiBase}/v1/oauth2/token`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${authHeader}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: 'grant_type=client_credentials',
	});

	console.log(`OAuth Response Status: ${tokenRes.status}`);
	if (!tokenRes.ok) {
		const errText = await tokenRes.text();
		throw new Error(`Failed to obtain OAuth token: ${tokenRes.status} - ${errText}`);
	}

	const tokenData = (await tokenRes.json()) as OAuthResponse;
	const accessToken = tokenData.access_token;
	console.log('OAuth token received successfully (token value withheld from logs).');

	// 2. Create Order
	console.log('\n[2/6] Creating sandbox order for 10.00 USD (intent: CAPTURE)...');
	const orderPayload = {
		intent: 'CAPTURE',
		purchase_units: [
			{
				reference_id: 'spike-order-unit-1',
				description: 'ReturnGate Sandbox Spike Item',
				amount: {
					currency_code: 'USD',
					value: '10.00',
				},
			},
		],
		application_context: {
			return_url: 'http://localhost:3000/api/paypal/success',
			cancel_url: 'http://localhost:3000/api/paypal/cancel',
			user_action: 'PAY_NOW',
		},
	};

	const orderRes = await fetch(`${apiBase}/v2/checkout/orders`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(orderPayload),
	});

	console.log(`Create Order Response Status: ${orderRes.status}`);
	const orderData = (await orderRes.json()) as OrderResponse;
	if (!orderRes.ok) {
		throw new Error(`Failed to create order: ${JSON.stringify(orderData)}`);
	}

	const orderId = orderData.id;
	console.log(`Order ID: ${orderId}`);
	console.log(`Order Status: ${orderData.status}`);

	const approveLink = orderData.links?.find((link) => link.rel === 'approve')?.href;
	if (!approveLink) {
		throw new Error('No approve link returned in order response links.');
	}

	// 3. Buyer approval step
	console.log('\n[3/6] Buyer Approval Required:');
	console.log(`Approve URL: ${approveLink}`);
	console.log('Please open the URL in your browser and log in with your sandbox buyer credentials.');
	await promptUser('Press Enter once you have completed the approval in sandbox...');

	// 4. Capture Order
	console.log('\n[4/6] Capturing approved order...');
	const captureRes = await fetch(`${apiBase}/v2/checkout/orders/${orderId}/capture`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
		},
	});

	console.log(`Capture Response Status: ${captureRes.status}`);
	const captureData = (await captureRes.json()) as CaptureResponse;
	if (!captureRes.ok) {
		throw new Error(`Failed to capture order: ${JSON.stringify(captureData)}`);
	}

	const capture = captureData.purchase_units?.[0]?.payments?.captures?.[0];
	if (!capture?.id) {
		throw new Error(`No capture id found in capture response: ${JSON.stringify(captureData)}`);
	}

	const captureId = capture.id;
	console.log(`Capture ID: ${captureId}`);
	console.log(`Capture Status: ${capture.status}`);

	// 5. Partial Refund (1.00 USD) with fixed PayPal-Request-Id
	const fixedRequestId = `spike-refund-${Date.now()}`;
	console.log(`\n[5/6] Requesting partial refund of 1.00 USD with PayPal-Request-Id: ${fixedRequestId}...`);

	const refundPayload = {
		amount: {
			value: '1.00',
			currency_code: 'USD',
		},
		note_to_payer: 'ReturnGate spike keep-it partial refund test',
	};

	const refundRes1 = await fetch(`${apiBase}/v2/payments/captures/${captureId}/refund`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
			'PayPal-Request-Id': fixedRequestId,
		},
		body: JSON.stringify(refundPayload),
	});

	console.log(`Refund Attempt 1 Status: ${refundRes1.status}`);
	const refundData1 = (await refundRes1.json()) as RefundResponse;
	if (!refundRes1.ok) {
		throw new Error(`Failed to issue refund attempt 1: ${JSON.stringify(refundData1)}`);
	}

	console.log(`Refund 1 ID: ${refundData1.id}`);
	console.log(`Refund 1 Status: ${refundData1.status}`);

	// 6. Replay identical refund call with the same PayPal-Request-Id
	console.log(`\n[6/6] Replaying identical refund call with the same PayPal-Request-Id: ${fixedRequestId}...`);
	console.log('[VERIFY IN SANDBOX: Idempotent replay returns HTTP 200 or 201 with identical refund ID without creating duplicate]');

	const refundRes2 = await fetch(`${apiBase}/v2/payments/captures/${captureId}/refund`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
			'PayPal-Request-Id': fixedRequestId,
		},
		body: JSON.stringify(refundPayload),
	});

	console.log(`Refund Attempt 2 Status: ${refundRes2.status}`);
	const refundData2 = (await refundRes2.json()) as RefundResponse;
	if (!refundRes2.ok) {
		throw new Error(`Failed to replay refund attempt 2: ${JSON.stringify(refundData2)}`);
	}

	console.log(`Refund 2 ID: ${refundData2.id}`);
	console.log(`Refund 2 Status: ${refundData2.status}`);

	if (refundData1.id === refundData2.id) {
		console.log('\nSUCCESS: PayPal returned the identical refund ID on replay. Zero duplicate refunds created.');
	} else {
		throw new Error(
			`IDEMPOTENCY FAILURE: Expected refund IDs to match, but got ${refundData1.id} vs ${refundData2.id}`,
		);
	}

	console.log('\n=== Spike Complete: Gate 1 loop verified ===');
}

runSpike().catch((err) => {
	console.error('\nSpike error:', err.message || err);
	process.exit(1);
});
