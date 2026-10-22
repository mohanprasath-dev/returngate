import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateWorkspace } from '@/lib/workspace';

export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		const { id } = await params;
		const workspace = await getOrCreateWorkspace();
		const returnCase = workspace.cases.find((c) => c.id === id);

		if (!returnCase) {
			return NextResponse.json({ error: 'Case not found' }, { status: 404 });
		}

		const order = workspace.orders.find((o) => o.id === returnCase.orderId);

		return NextResponse.json({
			case: returnCase,
			order,
			policy: workspace.policy,
		});
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
