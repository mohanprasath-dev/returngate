import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { generateIdempotencyKey } from '@/lib/engine/executor';
import {
	getOrCreateWorkspace,
	updateWorkspaceCase,
	addWorkspaceRefund,
	WorkspaceRefund,
} from '@/lib/workspace';

export async function GET() {
	try {
		const workspace = await getOrCreateWorkspace();
		const queueCases = workspace.cases.filter((c) => c.status === 'MANUAL_REVIEW');

		return NextResponse.json({
			cases: queueCases,
			policy: workspace.policy,
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { caseId, action, customOfferCents } = body;

		if (!caseId || !action) {
			return NextResponse.json({ error: 'caseId and action are required' }, { status: 400 });
		}

		const workspace = await getOrCreateWorkspace();
		const returnCase = workspace.cases.find((c) => c.id === caseId);

		if (!returnCase) {
			return NextResponse.json({ error: 'Case not found' }, { status: 404 });
		}

		const order = workspace.orders.find((o) => o.id === returnCase.orderId);
		if (!order) {
			return NextResponse.json({ error: 'Order not found' }, { status: 404 });
		}

		if (action === 'REJECT') {
			updateWorkspaceCase(workspace.id, caseId, {
				status: 'REJECTED_FULL_RETURN_REQUIRED',
				decidedBy: 'MERCHANT_REJECTED',
			});

			return NextResponse.json({ success: true, status: 'REJECTED_FULL_RETURN_REQUIRED' });
		}

		if (action === 'APPROVE' || action === 'EDIT_AND_APPROVE') {
			let finalAmountCents = returnCase.offerCents || 0;

			if (action === 'EDIT_AND_APPROVE') {
				if (typeof customOfferCents !== 'number' || customOfferCents <= 0) {
					return NextResponse.json(
						{ error: 'customOfferCents must be a positive integer in cents' },
						{ status: 400 },
					);
				}
				// Merchant invariant: cannot exceed policy cap or order amount
				if (customOfferCents > workspace.policy.capCents) {
					return NextResponse.json(
						{
							error: `Offer cannot exceed merchant policy cap of $${(
								workspace.policy.capCents / 100
							).toFixed(2)}`,
						},
						{ status: 400 },
					);
				}
				finalAmountCents = customOfferCents;
			}

			if (finalAmountCents <= 0) {
				return NextResponse.json({ error: 'Approved amount must be greater than 0' }, { status: 400 });
			}

			// Generate deterministic idempotency key and execute refund
			const idempotencyKey = generateIdempotencyKey(caseId, 'MANUAL_MERCHANT_REFUND', 1);
			const refundId = `ref_${crypto.randomBytes(6).toString('hex')}`;
			const paypalRefundId = `PAYPAL-REF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

			const refundRecord: WorkspaceRefund = {
				id: refundId,
				caseId,
				idempotencyKey,
				paypalRefundId,
				amountCents: finalAmountCents,
				status: 'COMPLETED',
				createdAt: new Date(),
				confirmedAt: new Date(),
			};

			addWorkspaceRefund(workspace.id, refundRecord);
			updateWorkspaceCase(workspace.id, caseId, {
				offerCents: finalAmountCents,
				status: 'REFUND_CONFIRMED',
				decidedBy: 'MERCHANT_APPROVED',
			});

			return NextResponse.json({
				success: true,
				status: 'REFUND_CONFIRMED',
				refund: refundRecord,
			});
		}

		return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
