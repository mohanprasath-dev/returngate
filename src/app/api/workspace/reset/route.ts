import { NextResponse } from 'next/server';
import { resetWorkspace } from '@/lib/workspace';

export async function POST() {
	try {
		const workspace = await resetWorkspace();
		return NextResponse.json({ success: true, workspace });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
