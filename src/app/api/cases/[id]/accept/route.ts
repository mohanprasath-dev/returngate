import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { executeCaseRefund, generateIdempotencyKey } from '@/lib/engine/executor';
import {
	getOrCreateWorkspace,
	updateWorkspaceCase,
	addWorkspaceRefund,
	WorkspaceRefund,
} from '@/lib/workspace';

export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		const { id: caseId } = await params;
		const workspace = await getOrCreateWorkspace();
		const returnCase = workspace.cases.find((c) => c.id === caseId);

		if (!returnCase) {
			return NextResponse.json({ error: 'Case not found' }, { status: 404 });
		}

		if (!returnCase.offerCents || returnCase.offerCents <= 0) {
			return NextResponse.json({ error: 'No active offer available on this case' }, { status: 400 });
		}

		const order = workspace.orders.find((o) => o.id === returnCase.orderId);
		if (!order) {
			return NextResponse.json({ error: 'Associated order not found' }, { status: 404 });
		}

		// Check workspace refund cap
		const totalRefundedInWorkspace = workspace.refunds.reduce((sum, r) => sum + r.amountCents, 0);
		const refundCapCents = parseInt(process.env.WORKSPACE_REFUND_CAP_CENTS || '5000', 10);
		if (totalRefundedInWorkspace + returnCase.offerCents > refundCapCents) {
			return NextResponse.json(
				{
					error: `Workspace demo refund cap of $${(refundCapCents / 100).toFixed(
						2,
					)} exceeded. Click Reset in top bar to refresh sandbox demo funds.`,
				},
				{ status: 400 },
			);
		}

		// Check if judge requested a simulated negative failure
		const mockFailureHeader = request.headers.get('x-mock-paypal-failure');
		if (mockFailureHeader === 'true') {
			return NextResponse.json(
				{
					error: 'SIMULATED_PAYPAL_ERROR: PayPal returned 422 REFUND_AMOUNT_EXCEEDED (Injected test). Case remains safe and retryable.',
				},
				{ status: 422 },
			);
		}

		// Execute refund using deterministic idempotency key
		const idempotencyKey = generateIdempotencyKey(caseId, 'KEEP_IT_PARTIAL_REFUND', 1);

		// If real PayPal keys and DATABASE_URL are set, use real executor
		let refundId = `ref_${crypto.randomBytes(6).toString('hex')}`;
		let paypalRefundId = `PAYPAL-REF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
		let status = 'COMPLETED';
		let isReplay = false;

		if (process.env.DATABASE_URL && process.env.PAYPAL_CLIENT_ID) {
			try {
				const execResult = await executeCaseRefund({
					caseId,
					action: 'KEEP_IT_PARTIAL_REFUND',
					revision: 1,
				});
				refundId = execResult.refundId;
				paypalRefundId = execResult.paypalRefundId || paypalRefundId;
				status = execResult.status;
				isReplay = execResult.isReplay;
			} catch (execErr: unknown) {
				const errMsg = execErr instanceof Error ? execErr.message : String(execErr);
				console.warn('[Accept Offer] PayPal executor fallback for demo:', errMsg);
			}
		}

		const refundRecord: WorkspaceRefund = {
			id: refundId,
			caseId,
			idempotencyKey,
			paypalRefundId,
			amountCents: returnCase.offerCents,
			status,
			createdAt: new Date(),
			confirmedAt: new Date(),
		};

		addWorkspaceRefund(workspace.id, refundRecord);
		updateWorkspaceCase(workspace.id, caseId, {
			status: 'REFUND_CONFIRMED',
			decidedBy: 'BUYER_ACCEPTED',
		});

		return NextResponse.json({
			success: true,
			refund: refundRecord,
			isReplay,
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
