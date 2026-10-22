import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOrCreateWorkspace, updateWorkspacePolicy } from '@/lib/workspace';

export async function GET() {
	try {
		const workspace = await getOrCreateWorkspace();
		return NextResponse.json({ policy: workspace.policy });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const {
			capCents,
			minorPercent,
			salvageCents,
			returnShippingCents,
			handlingCents,
			minSavingsCents,
			minConfidence,
			enabled,
		} = body;

		const workspace = await getOrCreateWorkspace();

		const updatedPolicy = {
			capCents: typeof capCents === 'number' ? Math.max(0, Math.round(capCents)) : workspace.policy.capCents,
			minorPercent:
				typeof minorPercent === 'number'
					? Math.min(100, Math.max(0, Math.round(minorPercent)))
					: workspace.policy.minorPercent,
			salvageCents:
				typeof salvageCents === 'number' ? Math.max(0, Math.round(salvageCents)) : workspace.policy.salvageCents,
			returnShippingCents:
				typeof returnShippingCents === 'number'
					? Math.max(0, Math.round(returnShippingCents))
					: workspace.policy.returnShippingCents,
			handlingCents:
				typeof handlingCents === 'number' ? Math.max(0, Math.round(handlingCents)) : workspace.policy.handlingCents,
			minSavingsCents:
				typeof minSavingsCents === 'number'
					? Math.max(0, Math.round(minSavingsCents))
					: workspace.policy.minSavingsCents,
			minConfidence:
				typeof minConfidence === 'number'
					? Math.min(1, Math.max(0, minConfidence))
					: workspace.policy.minConfidence,
			enabled: typeof enabled === 'boolean' ? enabled : workspace.policy.enabled,
		};

		updateWorkspacePolicy(workspace.id, updatedPolicy);

		if (process.env.DATABASE_URL) {
			try {
				await prisma.merchantPolicy.upsert({
					where: { workspaceId: workspace.id },
					update: updatedPolicy,
					create: {
						workspaceId: workspace.id,
						...updatedPolicy,
					},
				});
			} catch (dbErr) {
				console.warn('[Policy API] DB upsert fallback:', dbErr);
			}
		}

		return NextResponse.json({ success: true, policy: updatedPolicy });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
