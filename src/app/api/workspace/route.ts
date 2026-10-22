import { NextResponse } from 'next/server';
import { getOrCreateWorkspace } from '@/lib/workspace';

export async function GET() {
	try {
		const workspace = await getOrCreateWorkspace();
		return NextResponse.json({ workspace });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
