'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
	FileText,
	CheckCircle2,
	RefreshCw,
	Coins,
	ShieldCheck,
	Clock,
} from 'lucide-react';

interface LedgerEntry {
	caseId: string;
	orderId: string;
	captureId: string;
	itemTitle: string;
	orderAmountCents: number;
	decision: string;
	status: string;
	offerCents: number | null;
	decidedBy: string;
	refundId: string | null;
	paypalRefundId: string | null;
	idempotencyKey: string | null;
	refundStatus: string | null;
	webhookVerified: boolean;
	webhookEventId: string | null;
	createdAt: string;
	confirmedAt: string | null;
}

export default function LedgerPage() {
	const [ledger, setLedger] = useState<LedgerEntry[]>([]);
	const [stats, setStats] = useState<{ totalCases: number; totalRefundedCents: number; totalSavedCents: number }>({
		totalCases: 0,
		totalRefundedCents: 0,
		totalSavedCents: 0,
	});
	const [isLoading, setIsLoading] = useState(true);

	const fetchLedger = async () => {
		try {
			const res = await fetch('/api/merchant/ledger');
			const data = await res.json();
			setLedger(data.ledger || []);
			if (data.stats) setStats(data.stats);
		} catch (err) {
			console.error(err);
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		fetchLedger();
	}, []);

	return (
		<div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
			{/* Header */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b">
				<div>
					<h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
						<FileText className="w-6 h-6 text-primary" />
						<span>Refund Ledger & Webhook Verification</span>
					</h1>
					<p className="text-xs sm:text-sm text-muted-foreground mt-1">
						Immutable audit log of all keep-it return cases, deterministic idempotency keys, and verified PayPal webhook events.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" size="sm" onClick={fetchLedger} className="text-xs gap-1.5">
						<RefreshCw className="w-3.5 h-3.5" />
						Refresh Ledger
					</Button>
				</div>
			</div>

			{/* Metrics Bar */}
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<Card className="bg-slate-50/70 border-slate-200">
					<CardContent className="p-4 flex items-center justify-between">
						<div>
							<span className="text-xs text-muted-foreground block">Total Cases Processed</span>
							<span className="text-2xl font-bold text-slate-900">{stats.totalCases}</span>
						</div>
						<div className="p-2 rounded-full bg-blue-100 text-blue-700">
							<Clock className="w-5 h-5" />
						</div>
					</CardContent>
				</Card>

				<Card className="bg-slate-50/70 border-slate-200">
					<CardContent className="p-4 flex items-center justify-between">
						<div>
							<span className="text-xs text-muted-foreground block">Total Keep-It Refunds Issued</span>
							<span className="text-2xl font-bold text-slate-900 font-mono">
								${(stats.totalRefundedCents / 100).toFixed(2)} USD
							</span>
						</div>
						<div className="p-2 rounded-full bg-emerald-100 text-emerald-700">
							<Coins className="w-5 h-5" />
						</div>
					</CardContent>
				</Card>

				<Card className="bg-slate-50/70 border-slate-200">
					<CardContent className="p-4 flex items-center justify-between">
						<div>
							<span className="text-xs text-muted-foreground block">Avoided Shipping & Handling</span>
							<span className="text-2xl font-bold text-emerald-700 font-mono">
								+${(stats.totalSavedCents / 100).toFixed(2)} saved
							</span>
						</div>
						<div className="p-2 rounded-full bg-purple-100 text-purple-700">
							<ShieldCheck className="w-5 h-5" />
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Ledger Table */}
			<Card className="overflow-hidden">
				<CardHeader className="p-4 border-b bg-slate-50/50">
					<div className="flex items-center justify-between">
						<CardTitle className="text-base">Transactions & Verified Webhook Events</CardTitle>
						<Badge variant="outline" className="font-mono text-xs">
							{ledger.length} Records
						</Badge>
					</div>
					<CardDescription className="text-xs">
						Every PayPal mutation sends a deterministic UUIDv5 idempotency key, preventing double refunds upon replay.
					</CardDescription>
				</CardHeader>

				<CardContent className="p-0">
					{isLoading ? (
						<div className="p-12 text-center text-sm text-muted-foreground">Loading ledger transactions...</div>
					) : ledger.length === 0 ? (
						<div className="p-12 text-center space-y-2">
							<p className="text-sm text-muted-foreground">No return cases recorded in this workspace session yet.</p>
							<Link href="/">
								<Button size="sm" variant="outline" className="text-xs">
									Start a Test Return Case
								</Button>
							</Link>
						</div>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-xs text-left">
								<thead className="bg-slate-100 text-slate-700 uppercase font-semibold text-[11px] border-b">
									<tr>
										<th className="p-3 pl-4">Case & Item</th>
										<th className="p-3">Capture ID</th>
										<th className="p-3">Triage Decision</th>
										<th className="p-3">Keep-It Refund</th>
										<th className="p-3">PayPal Refund ID</th>
										<th className="p-3">Idempotency Key</th>
										<th className="p-3 pr-4">Webhook Verified</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-200">
									{ledger.map((entry) => (
										<tr key={entry.caseId} className="hover:bg-slate-50/70 transition-colors">
											<td className="p-3 pl-4">
												<div className="font-semibold text-slate-900">{entry.itemTitle}</div>
												<div className="font-mono text-[10px] text-muted-foreground">{entry.caseId}</div>
											</td>
											<td className="p-3 font-mono text-[11px] text-slate-700">
												{entry.captureId}
											</td>
											<td className="p-3">
												<Badge
													variant={
														entry.decision === 'AUTO_OFFER'
															? 'secondary'
															: entry.decision === 'MANUAL_REVIEW'
															? 'warning'
															: 'outline'
													}
													className="text-[10px]"
												>
													{entry.decision}
												</Badge>
											</td>
											<td className="p-3 font-mono font-bold text-slate-900">
												{entry.offerCents ? `$${(entry.offerCents / 100).toFixed(2)}` : '-'}
											</td>
											<td className="p-3 font-mono text-[11px]">
												{entry.paypalRefundId ? (
													<span className="text-slate-800 font-medium">{entry.paypalRefundId}</span>
												) : (
													<span className="text-muted-foreground">-</span>
												)}
											</td>
											<td className="p-3 font-mono text-[10px] text-slate-600 max-w-[120px] truncate" title={entry.idempotencyKey || ''}>
												{entry.idempotencyKey || '-'}
											</td>
											<td className="p-3 pr-4">
												{entry.webhookVerified ? (
													<div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
														<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
														<span className="font-mono text-[10px]">{entry.webhookEventId || 'VERIFIED'}</span>
													</div>
												) : (
													<span className="text-muted-foreground text-[11px]">Pending Event</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
