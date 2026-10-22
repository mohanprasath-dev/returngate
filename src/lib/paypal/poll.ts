import { prisma } from '@/lib/db';
import { getRefund, RefundResponse } from './refunds';

export interface PollRefundResult {
	refund: RefundResponse;
	isConfirmed: boolean;
}

export async function pollRefundStatus(
	refundId: string,
	caseId?: string,
): Promise<PollRefundResult> {
	const paypalRefund = await getRefund(refundId);
	const isConfirmed = paypalRefund.status.toUpperCase() === 'COMPLETED';

	if (isConfirmed) {
		try {
			await prisma.refund.updateMany({
				where: {
					OR: [{ paypalRefundId: refundId }, ...(caseId ? [{ caseId }] : [])],
				},
				data: {
					status: 'CONFIRMED',
					confirmedAt: new Date(),
					paypalRefundId: refundId,
				},
			});
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			console.warn('[pollRefundStatus] DB update skipped or failed:', message);
		}
	}

	return {
		refund: paypalRefund,
		isConfirmed,
	};
}
