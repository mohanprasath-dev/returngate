'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import type { VisionOutput } from '@/lib/vision/schema';
import type { EnginePolicy } from '@/lib/engine/offer';
import {
	Inbox,
	CheckCircle2,
	XCircle,
	AlertTriangle,
	RefreshCw,
	FileText,
} from 'lucide-react';

interface QueueCase {
	id: string;
	orderId: string;
	nonce: string;
	status: string;
	offerCents: number | null;
	visionJson: VisionOutput | null;
	createdAt: string;
	order?: {
		captureId: string;
		amountCents: number;
		itemTitle: string;
		itemSku: string;
	};
}

export default function ReviewQueuePage() {
	const [cases, setCases] = useState<QueueCase[]>([]);
	const [policy, setPolicy] = useState<EnginePolicy | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [actionPendingId, setActionPendingId] = useState<string | null>(null);
	const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
	const [successMsg, setSuccessMsg] = useState<string | null>(null);

	const fetchQueue = async () => {
		try {
			const res = await fetch('/api/merchant/queue');
			const data = await res.json();
			setCases(data.cases || []);
			setPolicy(data.policy || null);
		} catch (err) {
			console.error(err);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		fetchQueue();
	}, []);

	const handleAction = async (caseId: string, action: 'APPROVE' | 'EDIT_AND_APPROVE' | 'REJECT') => {
		setActionPendingId(caseId);
		setSuccessMsg(null);

		let customOfferCents: number | undefined;
		if (action === 'EDIT_AND_APPROVE') {
			const entered = customAmounts[caseId];
			if (!entered) {
				alert('Please enter an amount in dollars');
				setActionPendingId(null);
				return;
			}
			customOfferCents = Math.round(parseFloat(entered) * 100);
		}

		try {
			const res = await fetch('/api/merchant/queue', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					caseId,
					action,
					customOfferCents,
				}),
			});
			const data = await res.json();
			if (!res.ok) {
				alert(data.error || 'Action failed');
			} else {
				setSuccessMsg(`Case ${caseId} updated: ${data.status}`);
				await fetchQueue();
			}
		} catch (err) {
			console.error(err);
			alert('Network error during action');
		} finally {
			setActionPendingId(null);
		}
	};

	if (isLoading) {
		return <div className="max-w-5xl mx-auto py-16 text-center text-sm text-muted-foreground">Loading review queue...</div>;
	}

	return (
		<div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
			{/* Header */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b">
				<div>
					<h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
						<Inbox className="w-6 h-6 text-primary" />
						<span>Merchant Review Queue</span>
					</h1>
					<p className="text-xs sm:text-sm text-muted-foreground mt-1">
						Review flagged return cases (ambiguous photos, screen captures, or custom defect triage).
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" size="sm" onClick={fetchQueue} className="text-xs gap-1.5">
						<RefreshCw className="w-3.5 h-3.5" />
						Refresh Queue
					</Button>
					<Link href="/ledger">
						<Button variant="outline" size="sm" className="text-xs gap-1.5">
							<FileText className="w-3.5 h-3.5" />
							View Ledger
						</Button>
					</Link>
				</div>
			</div>

			{successMsg && (
				<div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
					<CheckCircle2 className="w-4 h-4 text-emerald-600" />
					<span>{successMsg}</span>
				</div>
			)}

			{/* Queue Content */}
			{cases.length === 0 ? (
				<Card className="border-dashed p-12 text-center space-y-3">
					<CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
					<h3 className="text-base font-semibold text-slate-800">Review Queue Empty</h3>
					<p className="text-xs text-muted-foreground max-w-md mx-auto">
						No cases currently awaiting manual merchant review. Any return cases that fail automated triage will appear here.
					</p>
					<div className="pt-2">
						<Link href="/">
							<Button size="sm" variant="outline" className="text-xs">
								Go to Buyer Portal to Trigger a Case
							</Button>
						</Link>
					</div>
				</Card>
			) : (
				<div className="space-y-6">
					{cases.map((c) => {
						const proposedDollars = (c.offerCents ? c.offerCents / 100 : 15.0).toFixed(2);
						return (
							<Card key={c.id} className="border-amber-300 shadow-sm overflow-hidden">
								<CardHeader className="bg-amber-50/50 p-4 border-b flex flex-row items-center justify-between">
									<div className="space-y-0.5">
										<div className="flex items-center gap-2">
											<Badge variant="warning" className="text-xs">
												MANUAL_REVIEW
											</Badge>
											<span className="font-mono text-xs font-semibold">{c.id}</span>
										</div>
										<CardDescription className="text-xs">
											Created: {new Date(c.createdAt).toLocaleTimeString()} | Capture: {c.order?.captureId || 'N/A'}
										</CardDescription>
									</div>
									<div className="text-right">
										<span className="text-[11px] text-muted-foreground block">Capture Total</span>
										<span className="font-bold text-slate-900 font-mono">
											${c.order ? (c.order.amountCents / 100).toFixed(2) : '85.00'}
										</span>
									</div>
								</CardHeader>

								<CardContent className="p-5 space-y-4 text-xs">
									<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
										{/* AI Evidence Triage Breakdown */}
										<div className="bg-slate-50 p-3.5 rounded-lg border space-y-2">
											<div className="font-semibold text-slate-800 flex items-center gap-1.5">
												<AlertTriangle className="w-4 h-4 text-amber-600" />
												<span>AI Evidence Triage Flags</span>
											</div>
											{c.visionJson ? (
												<div className="space-y-1 font-mono text-[11px]">
													<div className="flex justify-between">
														<span>Defect Class:</span>
														<span className="font-semibold text-slate-900">{c.visionJson.defect_class}</span>
													</div>
													<div className="flex justify-between">
														<span>Confidence:</span>
														<span>{Math.round((c.visionJson.confidence || 0) * 100)}%</span>
													</div>
													<div className="flex justify-between">
														<span>Nonce Visible:</span>
														<span className={c.visionJson.nonce_visible ? 'text-emerald-700' : 'text-rose-700'}>
															{c.visionJson.nonce_visible ? 'YES' : 'NO'}
														</span>
													</div>
													<div className="flex justify-between">
														<span>Screen Capture Suspected:</span>
														<span className={c.visionJson.screen_capture_suspected ? 'text-rose-700 font-bold' : 'text-slate-700'}>
															{c.visionJson.screen_capture_suspected ? 'YES' : 'NO'}
														</span>
													</div>
													<div className="pt-1.5 border-t text-[11px] font-sans text-muted-foreground">
														<span className="font-semibold text-slate-700">Notes:</span> {c.visionJson.notes}
													</div>
												</div>
											) : (
												<p className="text-muted-foreground">Standard manual review hold.</p>
											)}
										</div>

										{/* Decision Controls */}
										<div className="space-y-3 flex flex-col justify-between">
											<div className="space-y-1.5">
												<span className="font-semibold text-slate-800">Merchant Cap:</span>
												<div className="text-muted-foreground">
													${policy ? (policy.capCents / 100).toFixed(2) : '25.00'} USD
												</div>
											</div>

											{/* Edit Down Input */}
											<div className="space-y-1 bg-slate-50 p-3 rounded-lg border">
												<label className="font-semibold text-slate-700 text-[11px]">
													Custom Offer Amount ($):
												</label>
												<div className="flex items-center gap-2">
													<Input
														type="number"
														step="0.50"
														min="1"
														max={policy ? policy.capCents / 100 : 25}
														placeholder={proposedDollars}
														value={customAmounts[c.id] || ''}
														onChange={(e) =>
															setCustomAmounts({ ...customAmounts, [c.id]: e.target.value })
														}
														className="h-8 text-xs font-mono"
													/>
													<Button
														size="xs"
														variant="outline"
														onClick={() => handleAction(c.id, 'EDIT_AND_APPROVE')}
														disabled={actionPendingId === c.id}
														className="text-xs"
													>
														Apply & Approve
													</Button>
												</div>
											</div>
										</div>
									</div>
								</CardContent>

								<CardFooter className="bg-slate-50/50 p-3 px-5 border-t flex flex-wrap justify-between items-center gap-3">
									<div className="text-xs text-muted-foreground">
										Approving triggers a partial refund on the PayPal sandbox capture.
									</div>
									<div className="flex items-center gap-2">
										<Button
											variant="destructive"
											size="xs"
											onClick={() => handleAction(c.id, 'REJECT')}
											disabled={actionPendingId === c.id}
											className="gap-1 text-xs"
										>
											<XCircle className="w-3.5 h-3.5" />
											Reject & Require Full Return
										</Button>
										<Button
											size="xs"
											onClick={() => handleAction(c.id, 'APPROVE')}
											disabled={actionPendingId === c.id}
											className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs"
										>
											<CheckCircle2 className="w-3.5 h-3.5" />
											Approve Proposed (${proposedDollars})
										</Button>
									</div>
								</CardFooter>
							</Card>
						);
					})}
				</div>
			)}
		</div>
	);
}
