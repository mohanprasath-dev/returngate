'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { EnginePolicy } from '@/lib/engine/offer';
import {
	ArrowRight,
	ShieldCheck,
	Coins,
	FileText,
	Clock,
	Sliders,
	Layers,
	CheckCircle2,
} from 'lucide-react';

interface OrderItem {
	id: string;
	paypalOrderId: string;
	captureId: string;
	amountCents: number;
	currency: string;
	status: string;
	itemTitle: string;
	itemSku: string;
}

export default function HomePage() {
	const router = useRouter();
	const [orders, setOrders] = useState<OrderItem[]>([]);
	const [policy, setPolicy] = useState<EnginePolicy | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [creatingCaseId, setCreatingCaseId] = useState<string | null>(null);

	useEffect(() => {
		fetch('/api/workspace')
			.then((res) => res.json())
			.then((data) => {
				if (data.workspace) {
					setOrders(data.workspace.orders || []);
					setPolicy(data.workspace.policy || null);
				}
			})
			.catch((err) => console.error(err))
			.finally(() => setIsLoading(false));
	}, []);

	const handleStartCase = async (orderId: string) => {
		setCreatingCaseId(orderId);
		try {
			const res = await fetch('/api/cases', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ orderId }),
			});
			const data = await res.json();
			if (data.case?.id) {
				router.push(`/case/${data.case.id}`);
			} else {
				alert(data.error || 'Failed to initialize return case');
			}
		} catch (err) {
			console.error(err);
			alert('Network error initializing return case');
		} finally {
			setCreatingCaseId(null);
		}
	};

	return (
		<div className="max-w-6xl mx-auto px-4 py-8 space-y-10">
			{/* Hero Section */}
			<div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b">
				<div className="space-y-2">
					<div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
						<ShieldCheck className="w-3.5 h-3.5" />
						Pre-Label Return Prevention Engine
					</div>
					<h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
						Merchant-Controlled Keep-It Partial Refunds
					</h1>
					<p className="text-muted-foreground text-sm sm:text-base max-w-2xl">
						Settle minor cosmetic damage with an instant, capped PayPal partial refund before any return shipping label exists.
						Bounded by deterministic unit economics, backed by AI-assisted evidence triage.
					</p>
				</div>

				<div className="flex flex-wrap gap-2.5">
					<Link href="/policy">
						<Button variant="outline" size="sm" className="gap-1.5">
							<Sliders className="w-4 h-4" />
							Edit Policy
						</Button>
					</Link>
					<Link href="/queue">
						<Button variant="outline" size="sm" className="gap-1.5">
							<Layers className="w-4 h-4" />
							Review Queue
						</Button>
					</Link>
					<Link href="/ledger">
						<Button variant="outline" size="sm" className="gap-1.5">
							<FileText className="w-4 h-4" />
							Audit Ledger
						</Button>
					</Link>
				</div>
			</div>

			{/* Explanatory Unit Economics Banner */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<Card className="bg-slate-50/70 border-slate-200">
					<CardHeader className="p-4 pb-2">
						<div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
							<Coins className="w-4 h-4 text-emerald-600" />
							<span>Avoided Return Costs</span>
						</div>
					</CardHeader>
					<CardContent className="p-4 pt-1 text-xs text-muted-foreground">
						Return shipping ($6.00) + warehouse handling ($2.00) are saved when a buyer accepts a modest partial refund.
					</CardContent>
				</Card>

				<Card className="bg-slate-50/70 border-slate-200">
					<CardHeader className="p-4 pb-2">
						<div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
							<Clock className="w-4 h-4 text-blue-600" />
							<span>Single-Use 6-Digit Nonce</span>
						</div>
					</CardHeader>
					<CardContent className="p-4 pt-1 text-xs text-muted-foreground">
						Liveness challenge: buyer includes a 10-minute expiring nonce card in photo evidence. Prevents recycled photos.
					</CardContent>
				</Card>

				<Card className="bg-slate-50/70 border-slate-200">
					<CardHeader className="p-4 pb-2">
						<div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
							<ShieldCheck className="w-4 h-4 text-purple-600" />
							<span>Strict Deterministic Engine</span>
						</div>
					</CardHeader>
					<CardContent className="p-4 pt-1 text-xs text-muted-foreground">
						Vision answers flags only (defect class, confidence). Refund amounts are strictly capped integer cents calculated by code.
					</CardContent>
				</Card>
			</div>

			{/* Interactive Demo: Pick a Captured Order */}
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-xl font-bold tracking-tight">Select a Captured Order to Test Return Flow</h2>
						<p className="text-xs text-muted-foreground">
							These orders were pre-captured in PayPal sandbox. Click to generate a single-use nonce and test the keep-it triage.
						</p>
					</div>
					<Badge variant="outline" className="font-mono text-xs">
						{orders.length} Ready in Pool
					</Badge>
				</div>

				{isLoading ? (
					<div className="p-12 text-center text-sm text-muted-foreground">Loading sandbox workspace orders...</div>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
						{orders.map((order) => (
							<Card key={order.id} className="flex flex-col justify-between hover:border-slate-400 transition-all shadow-sm">
								<CardHeader className="p-5 pb-3">
									<div className="flex items-start justify-between gap-2">
										<Badge variant="secondary" className="font-mono text-[11px]">
											{order.itemSku}
										</Badge>
										<span className="font-bold text-lg text-slate-900">
											${(order.amountCents / 100).toFixed(2)}
										</span>
									</div>
									<CardTitle className="text-base mt-2">{order.itemTitle}</CardTitle>
									<CardDescription className="text-xs font-mono">
										Capture: {order.captureId}
									</CardDescription>
								</CardHeader>

								<CardContent className="p-5 pt-0 space-y-2 text-xs text-muted-foreground">
									<div className="flex justify-between py-1 border-t border-dashed">
										<span>PayPal Order ID:</span>
										<span className="font-mono text-slate-700">{order.paypalOrderId}</span>
									</div>
									<div className="flex justify-between py-1 border-t border-dashed">
										<span>Current Policy Cap:</span>
										<span className="font-semibold text-slate-900">
											${policy ? (policy.capCents / 100).toFixed(2) : '25.00'}
										</span>
									</div>
								</CardContent>

								<CardFooter className="p-5 pt-0">
									<Button
										className="w-full gap-2 text-xs"
										onClick={() => handleStartCase(order.id)}
										disabled={creatingCaseId === order.id}
									>
										{creatingCaseId === order.id ? (
											'Generating Nonce...'
										) : (
											<>
												<span>Start Keep-It Return</span>
												<ArrowRight className="w-3.5 h-3.5" />
											</>
										)}
									</Button>
								</CardFooter>
							</Card>
						))}
					</div>
				)}
			</div>

			{/* Guardrails and Compliance Note */}
			<div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-4 text-xs text-amber-900 space-y-1">
				<div className="font-semibold flex items-center gap-1.5 text-amber-950">
					<CheckCircle2 className="w-4 h-4 text-amber-700" />
					<span>Hackathon Evaluation Guardrails</span>
				</div>
				<p className="text-amber-800 leading-relaxed">
					ReturnGate is a merchant-controlled pre-label workflow. It does not claim fraud prevention, dispute elimination,
					or proof of item authenticity. All money calculations are integer cents, and mutating calls send a deterministic
					PayPal-Request-Id (UUIDv5) to ensure zero duplicate refunds upon replay.
				</p>
			</div>
		</div>
	);
}
