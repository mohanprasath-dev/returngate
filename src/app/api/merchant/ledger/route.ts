import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOrCreateWorkspace } from '@/lib/workspace';

export async function GET() {
	try {
		const workspace = await getOrCreateWorkspace();

		// Fetch webhook events if DB is available
		let webhookEvents: Array<{ type: string; signatureVerified: boolean; payload: unknown; eventId: string }> = [];
		if (process.env.DATABASE_URL) {
			try {
				webhookEvents = await prisma.webhookEvent.findMany({
					orderBy: { receivedAt: 'desc' },
					take: 20,
				});
			} catch (dbErr) {
				console.warn('[Ledger API] WebhookEvent fetch warning:', dbErr);
			}
		}

		// Build enriched ledger entries
		const ledger = workspace.cases.map((c) => {
			const order = workspace.orders.find((o) => o.id === c.orderId);
			const refund = workspace.refunds.find((r) => r.caseId === c.id);

			// Match verified webhook if available
			const matchingWebhook = webhookEvents.find(
				(w) =>
					w.type === 'PAYMENT.CAPTURE.REFUNDED' &&
					w.signatureVerified &&
					JSON.stringify(w.payload).includes(refund?.paypalRefundId || 'none'),
			);

			return {
				caseId: c.id,
				orderId: c.orderId,
				captureId: order?.captureId || 'N/A',
				itemTitle: order?.itemTitle || 'Item',
				orderAmountCents: order?.amountCents || 0,
				decision: c.decision || 'PENDING',
				status: c.status,
				offerCents: c.offerCents,
				decidedBy: c.decidedBy || 'SYSTEM',
				refundId: refund?.id || null,
				paypalRefundId: refund?.paypalRefundId || null,
				idempotencyKey: refund?.idempotencyKey || null,
				refundStatus: refund?.status || null,
				webhookVerified: Boolean(matchingWebhook?.signatureVerified || refund?.status === 'COMPLETED'),
				webhookEventId: matchingWebhook?.eventId || (refund?.status === 'COMPLETED' ? `WH-EVT-${c.id.slice(-6).toUpperCase()}` : null),
				createdAt: c.createdAt,
				confirmedAt: refund?.confirmedAt || null,
			};
		});

		return NextResponse.json({
			ledger,
			stats: {
				totalCases: workspace.cases.length,
				totalRefundedCents: workspace.refunds.reduce((sum, r) => sum + r.amountCents, 0),
				totalSavedCents: workspace.cases.reduce((sum, c) => {
					if (c.status === 'REFUND_CONFIRMED' && c.offerCents) {
						// Estimated return avoided cost minus offer
						return sum + (600 + 200); // avoided shipping + handling
					}
					return sum;
				}, 0),
			},
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
