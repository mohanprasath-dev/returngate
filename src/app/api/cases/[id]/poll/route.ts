import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateWorkspace } from '@/lib/workspace';

export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		const { id: caseId } = await params;
		const workspace = await getOrCreateWorkspace();
		const returnCase = workspace.cases.find((c) => c.id === caseId);

		if (!returnCase) {
			return NextResponse.json({ error: 'Case not found' }, { status: 404 });
		}

		const refund = workspace.refunds.find((r) => r.caseId === caseId);

		return NextResponse.json({
			status: returnCase.status,
			refundConfirmed: Boolean(refund && refund.status === 'COMPLETED'),
			refund,
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
