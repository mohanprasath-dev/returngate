'use client';

import React, { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { VisionOutput } from '@/lib/vision/schema';
import type { EnginePolicy } from '@/lib/engine/offer';
import {
	Clock,
	UploadCloud,
	CheckCircle2,
	AlertCircle,
	Sparkles,
	FileCheck,
	Coins,
	RefreshCw,
	Inbox,
} from 'lucide-react';

interface CaseDetails {
	id: string;
	orderId: string;
	nonce: string;
	nonceExpiresAt: string;
	nonceUsedAt: string | null;
	status: string;
	decision: string | null;
	offerCents: number | null;
	visionJson: VisionOutput | null;
}

interface OrderDetails {
	id: string;
	paypalOrderId: string;
	captureId: string;
	amountCents: number;
	currency: string;
	itemTitle: string;
	itemSku: string;
}

export default function CasePage({ params }: { params: Promise<{ id: string }> }) {
	const { id: caseId } = use(params);

	const [caseData, setCaseData] = useState<CaseDetails | null>(null);
	const [orderData, setOrderData] = useState<OrderDetails | null>(null);
	const [policy, setPolicy] = useState<EnginePolicy | null>(null);
	const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(600);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
	const [isAccepting, setIsAccepting] = useState<boolean>(false);
	const [acceptSuccess, setAcceptSuccess] = useState<{ amountCents?: number; paypalRefundId?: string; idempotencyKey?: string } | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	// Fetch case data
	const fetchCase = useCallback(async () => {
		try {
			const res = await fetch(`/api/cases/${caseId}`);
			const data = await res.json();
			if (data.case) {
				setCaseData(data.case);
				setOrderData(data.order);
				setPolicy(data.policy);

				// Compute remaining seconds on nonce
				const expiry = new Date(data.case.nonceExpiresAt).getTime();
				const now = Date.now();
				const remaining = Math.max(0, Math.floor((expiry - now) / 1000));
				setTimeLeftSeconds(remaining);
			} else {
				setErrorMessage(data.error || 'Case not found');
			}
		} catch (err) {
			console.error(err);
			setErrorMessage('Failed to load case');
		} finally {
			setIsLoading(false);
		}
	}, [caseId]);

	useEffect(() => {
		fetchCase();
	}, [fetchCase]);

	// Countdown timer
	useEffect(() => {
		if (timeLeftSeconds <= 0 || caseData?.nonceUsedAt) return;
		const interval = setInterval(() => {
			setTimeLeftSeconds((prev) => (prev > 0 ? prev - 1 : 0));
		}, 1000);
		return () => clearInterval(interval);
	}, [timeLeftSeconds, caseData?.nonceUsedAt]);

	const formatTimer = (totalSeconds: number) => {
		const mins = Math.floor(totalSeconds / 60);
		const secs = totalSeconds % 60;
		return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	};

	// Client-side image resize to max 1600px
	const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (event) => {
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement('canvas');
				let width = img.width;
				let height = img.height;
				const MAX_SIZE = 1600;

				if (width > height && width > MAX_SIZE) {
					height = Math.round((height * MAX_SIZE) / width);
					width = MAX_SIZE;
				} else if (height > MAX_SIZE) {
					width = Math.round((width * MAX_SIZE) / height);
					height = MAX_SIZE;
				}

				canvas.width = width;
				canvas.height = height;
				const ctx = canvas.getContext('2d');
				ctx?.drawImage(img, 0, 0, width, height);

				const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
				submitEvidence({ imageBase64: base64, mimeType: 'image/jpeg' });
			};
			img.src = event.target?.result as string;
		};
		reader.readAsDataURL(file);
	};

	const submitEvidence = async (payload: { imageBase64?: string; mimeType?: string; sampleType?: string }) => {
		setIsSubmitting(true);
		setErrorMessage(null);
		try {
			const res = await fetch(`/api/cases/${caseId}/evidence`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});
			const data = await res.json();
			if (!res.ok) {
				setErrorMessage(data.error || 'Failed to analyze evidence');
			} else {
				await fetchCase();
			}
		} catch (err) {
			console.error(err);
			setErrorMessage('Network error during analysis');
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleAcceptOffer = async () => {
		setIsAccepting(true);
		setErrorMessage(null);

		const mockFailure = typeof window !== 'undefined' && sessionStorage.getItem('rg_mock_paypal_failure') === 'true';

		try {
			const res = await fetch(`/api/cases/${caseId}/accept`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(mockFailure ? { 'x-mock-paypal-failure': 'true' } : {}),
				},
			});
			const data = await res.json();
			if (!res.ok) {
				setErrorMessage(data.error || 'Failed to process refund');
			} else {
				setAcceptSuccess(data.refund);
				await fetchCase();
			}
		} catch (err) {
			console.error(err);
			setErrorMessage('Error communicating with refund engine');
		} finally {
			setIsAccepting(false);
		}
	};

	if (isLoading) {
		return <div className="max-w-3xl mx-auto py-16 text-center text-sm text-muted-foreground">Loading case details...</div>;
	}

	if (!caseData || !orderData) {
		return (
			<div className="max-w-xl mx-auto py-16 text-center space-y-4">
				<AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
				<h2 className="text-xl font-bold">Case Not Found</h2>
				<p className="text-sm text-muted-foreground">This case does not exist in your active session.</p>
				<Link href="/">
					<Button size="sm">Back to Order Selection</Button>
				</Link>
			</div>
		);
	}

	return (
		<div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
			{/* Breadcrumb / Top info */}
			<div className="flex items-center justify-between">
				<Link href="/" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
					<span>&larr; Back to Orders</span>
				</Link>
				<div className="flex items-center gap-2">
					<span className="text-xs font-mono text-muted-foreground">Case: {caseData.id}</span>
					<Badge
						variant={
							caseData.status === 'REFUND_CONFIRMED'
								? 'success'
								: caseData.status === 'AUTO_OFFER'
								? 'secondary'
								: caseData.status === 'MANUAL_REVIEW'
								? 'warning'
								: 'outline'
						}
					>
						{caseData.status}
					</Badge>
				</div>
			</div>

			{/* Order Header Summary */}
			<Card className="bg-slate-50/50">
				<CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
					<div>
						<div className="font-semibold text-sm text-slate-900">{orderData.itemTitle}</div>
						<div className="font-mono text-muted-foreground">SKU: {orderData.itemSku} | Capture: {orderData.captureId}</div>
					</div>
					<div className="text-right">
						<span className="text-muted-foreground block text-[11px]">Paid Total</span>
						<span className="text-base font-bold text-slate-900">${(orderData.amountCents / 100).toFixed(2)} USD</span>
					</div>
				</CardContent>
			</Card>

			{errorMessage && (
				<div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
					<AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
					<span>{errorMessage}</span>
				</div>
			)}

			{/* Step 1: Liveness Nonce Card */}
			{!caseData.decision && (
				<Card className="border-2 border-slate-300">
					<CardHeader className="pb-3">
						<div className="flex items-center justify-between">
							<CardTitle className="text-base sm:text-lg flex items-center gap-2">
								<Clock className="w-5 h-5 text-amber-600" />
								<span>Step 1: Your Single-Use Nonce Code</span>
							</CardTitle>
							<div
								className={`text-xs font-mono font-bold px-2 py-1 rounded border ${
									timeLeftSeconds > 60
										? 'bg-amber-50 text-amber-800 border-amber-300'
										: 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse'
								}`}
							>
								{timeLeftSeconds > 0 ? `Expires in ${formatTimer(timeLeftSeconds)}` : 'Expired'}
							</div>
						</div>
						<CardDescription className="text-xs">
							Write this code clearly on a slip of paper and place it next to the item in your photo.
							This prevents photo reuse and validates current physical custody.
						</CardDescription>
					</CardHeader>

					<CardContent className="space-y-4">
						<div className="flex justify-center my-2">
							<div className="bg-slate-900 text-amber-400 font-mono text-3xl sm:text-4xl font-extrabold tracking-widest px-8 py-3 rounded-xl shadow-inner border border-slate-700">
								{caseData.nonce}
							</div>
						</div>

						{/* Step 2: Upload or Test Scenarios */}
						<div className="border-t pt-4 space-y-3">
							<h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
								<UploadCloud className="w-4 h-4 text-blue-600" />
								<span>Step 2: Submit Photo Evidence</span>
							</h3>

							<div className="border-2 border-dashed rounded-xl p-6 text-center space-y-2 hover:bg-slate-50 transition-colors">
								<input
									type="file"
									id="item-photo"
									accept="image/*"
									className="hidden"
									onChange={handleFileUpload}
									disabled={isSubmitting || timeLeftSeconds <= 0}
								/>
								<label
									htmlFor="item-photo"
									className="cursor-pointer inline-flex items-center gap-2 text-xs font-semibold bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90"
								>
									{isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
									<span>{isSubmitting ? 'Analyzing with Gemini...' : 'Upload Item Photo'}</span>
								</label>
								<p className="text-[11px] text-muted-foreground">
									Client automatically downsizes images to max 1600px before AI evidence evaluation.
								</p>
							</div>

							{/* Judge Instant Scenario Presets */}
							<div className="bg-slate-100/70 rounded-xl p-4 space-y-2 border border-slate-200">
								<div className="flex items-center justify-between text-xs font-semibold text-slate-700">
									<span className="flex items-center gap-1.5">
										<Sparkles className="w-3.5 h-3.5 text-amber-500" />
										Judge Demo: One-Click Test Presets
									</span>
									<span className="text-[10px] text-muted-foreground">Instant eval verification</span>
								</div>

								<div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
									<Button
										variant="outline"
										size="sm"
										className="justify-start text-xs h-auto py-2 bg-white"
										onClick={() => submitEvidence({ sampleType: 'minor_scratch' })}
										disabled={isSubmitting}
									>
										<div className="text-left">
											<div className="font-semibold text-emerald-700">Minor Cosmetic Scratch</div>
											<div className="text-[10px] text-muted-foreground">Expected: AUTO_OFFER</div>
										</div>
									</Button>

									<Button
										variant="outline"
										size="sm"
										className="justify-start text-xs h-auto py-2 bg-white"
										onClick={() => submitEvidence({ sampleType: 'major_damage' })}
										disabled={isSubmitting}
									>
										<div className="text-left">
											<div className="font-semibold text-purple-700">Major Structural Damage</div>
											<div className="text-[10px] text-muted-foreground">Expected: FULL_RETURN_ONLY</div>
										</div>
									</Button>

									<Button
										variant="outline"
										size="sm"
										className="justify-start text-xs h-auto py-2 bg-white"
										onClick={() => submitEvidence({ sampleType: 'screen_capture' })}
										disabled={isSubmitting}
									>
										<div className="text-left">
											<div className="font-semibold text-amber-700">Photo of Computer Screen</div>
											<div className="text-[10px] text-muted-foreground">Anti-spoof: MANUAL_REVIEW</div>
										</div>
									</Button>

									<Button
										variant="outline"
										size="sm"
										className="justify-start text-xs h-auto py-2 bg-white"
										onClick={() => submitEvidence({ sampleType: 'injected_text' })}
										disabled={isSubmitting}
									>
										<div className="text-left">
											<div className="font-semibold text-rose-700">Prompt Injection Paper</div>
											<div className="text-[10px] text-muted-foreground">Guardrail: MANUAL_REVIEW</div>
										</div>
									</Button>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Decision Result 1: AUTO_OFFER */}
			{caseData.decision === 'AUTO_OFFER' && caseData.status !== 'REFUND_CONFIRMED' && (
				<Card className="border-2 border-emerald-500 shadow-md">
					<CardHeader className="bg-emerald-50/50 pb-4">
						<div className="flex items-center justify-between">
							<Badge variant="success" className="gap-1 text-xs">
								<CheckCircle2 className="w-3.5 h-3.5" />
								Keep-It Offer Pre-Approved
							</Badge>
							<span className="text-xs text-muted-foreground font-mono">Status: Capped Auto-Offer</span>
						</div>
						<CardTitle className="text-2xl font-extrabold text-emerald-950 mt-2">
							Keep the item and receive a ${(caseData.offerCents! / 100).toFixed(2)} refund
						</CardTitle>
						<CardDescription className="text-xs text-emerald-800">
							The merchant pre-approved a keep-it partial refund for minor cosmetic blemishes. No return label needed.
						</CardDescription>
					</CardHeader>

					<CardContent className="p-6 space-y-4">
						{/* Unit Economics Breakdown Inspector */}
						<div className="bg-slate-50 border rounded-lg p-4 space-y-2 text-xs">
							<div className="font-semibold text-slate-800 flex items-center gap-1.5">
								<Coins className="w-4 h-4 text-emerald-600" />
								<span>Deterministic Engine Calculation</span>
							</div>

							<div className="grid grid-cols-2 gap-2 text-muted-foreground pt-1 border-t">
								<div>Original Capture:</div>
								<div className="text-right font-mono text-slate-900">${(orderData.amountCents / 100).toFixed(2)}</div>

								<div>Minor Severity Rate ({policy?.minorPercent ?? 20}%):</div>
								<div className="text-right font-mono text-slate-900">
									${(Math.floor((orderData.amountCents * (policy?.minorPercent ?? 20)) / 100) / 100).toFixed(2)}
								</div>

								<div>Merchant Cap Limit:</div>
								<div className="text-right font-mono text-slate-900">${((policy?.capCents ?? 2500) / 100).toFixed(2)}</div>

								<div>Avoided Shipping + Handling:</div>
								<div className="text-right font-mono text-emerald-700 font-semibold">
									+${(((policy?.returnShippingCents ?? 600) + (policy?.handlingCents ?? 200)) / 100).toFixed(2)} saved
								</div>

								<div className="font-semibold text-slate-900 pt-1 border-t">Final Bounded Offer:</div>
								<div className="text-right font-mono font-bold text-emerald-700 pt-1 border-t text-sm">
									${(caseData.offerCents! / 100).toFixed(2)} USD
								</div>
							</div>
						</div>

						{caseData.visionJson && (
							<div className="text-[11px] text-muted-foreground bg-white border p-3 rounded-lg">
								<span className="font-semibold text-slate-700">AI Evidence Triage:</span> {caseData.visionJson.notes} (
								Defect: {caseData.visionJson.defect_class}, Confidence:{' '}
								{Math.round(caseData.visionJson.confidence * 100)}%)
							</div>
						)}
					</CardContent>

					<CardFooter className="bg-slate-50/50 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t">
						<span className="text-xs text-muted-foreground">
							Accepting triggers a PayPal partial refund directly on capture {orderData.captureId}.
						</span>
						<div className="flex items-center gap-2 w-full sm:w-auto">
							<Button
								variant="outline"
								size="sm"
								className="flex-1 sm:flex-none text-xs"
								onClick={() => alert('Standard return branch selected.')}
							>
								Decline & Return Item
							</Button>
							<Button
								size="sm"
								className="flex-1 sm:flex-none text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
								onClick={handleAcceptOffer}
								disabled={isAccepting}
							>
								{isAccepting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
								<span>{isAccepting ? 'Processing PayPal Refund...' : 'Accept Partial Refund'}</span>
							</Button>
						</div>
					</CardFooter>
				</Card>
			)}

			{/* Decision Result 2: MANUAL_REVIEW */}
			{caseData.decision === 'MANUAL_REVIEW' && caseData.status !== 'REFUND_CONFIRMED' && (
				<Card className="border-amber-300 bg-amber-50/30">
					<CardHeader>
						<Badge variant="warning" className="w-fit text-xs gap-1">
							<AlertCircle className="w-3.5 h-3.5" />
							Routed to Merchant Review
						</Badge>
						<CardTitle className="text-xl mt-2">Under Seller Review</CardTitle>
						<CardDescription className="text-xs text-amber-900">
							This case did not meet auto-approval criteria (e.g., ambiguous damage, anti-spoof flag, or missing nonce).
							It has been routed to the merchant review queue.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3 text-xs">
						{caseData.visionJson && (
							<div className="bg-white p-3 rounded-lg border border-amber-200">
								<span className="font-semibold text-slate-800">Triage Summary:</span> {caseData.visionJson.notes}
							</div>
						)}
						<p className="text-muted-foreground">
							The merchant will inspect the photo in their queue and can approve a keep-it partial refund or require a full return.
						</p>
					</CardContent>
					<CardFooter className="border-t pt-3 flex justify-between">
						<Link href="/queue">
							<Button variant="outline" size="sm" className="gap-1.5 text-xs">
								<Inbox className="w-3.5 h-3.5" />
								<span>Inspect in Merchant Queue</span>
							</Button>
						</Link>
					</CardFooter>
				</Card>
			)}

			{/* Decision Result 3: FULL_RETURN_ONLY */}
			{caseData.decision === 'FULL_RETURN_ONLY' && (
				<Card className="border-purple-300 bg-purple-50/30">
					<CardHeader>
						<Badge variant="secondary" className="w-fit text-xs">
							Standard Return Required
						</Badge>
						<CardTitle className="text-xl mt-2">Item Requires Full Return</CardTitle>
						<CardDescription className="text-xs text-purple-900">
							The damage is structural or exceeds cosmetic bounds. Keep-it partial refund unit economics do not apply.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3 text-xs">
						<p className="text-muted-foreground">
							A partial refund cannot cover this defect level. Please package the item for return shipping.
						</p>
					</CardContent>
				</Card>
			)}

			{/* Completed Refund Screen */}
			{caseData.status === 'REFUND_CONFIRMED' && (
				<Card className="border-2 border-emerald-500 bg-emerald-50/20">
					<CardHeader>
						<Badge variant="success" className="w-fit text-xs gap-1">
							<CheckCircle2 className="w-3.5 h-3.5" />
							PayPal Refund Confirmed
						</Badge>
						<CardTitle className="text-2xl text-emerald-950 mt-2">
							${((caseData.offerCents || acceptSuccess?.amountCents || 0) / 100).toFixed(2)} USD Refund Issued
						</CardTitle>
						<CardDescription className="text-xs text-emerald-800">
							The partial refund was successfully processed via PayPal Payments v2.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3 text-xs font-mono">
						<div className="bg-white p-4 rounded-lg border border-emerald-200 space-y-1.5">
							<div className="flex justify-between">
								<span className="text-muted-foreground font-sans">PayPal Refund ID:</span>
								<span className="font-bold text-slate-900">{acceptSuccess?.paypalRefundId || 'PAYPAL-REF-VERIFIED'}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground font-sans">Idempotency Key:</span>
								<span className="text-slate-700 text-[11px]">{acceptSuccess?.idempotencyKey || 'UUIDv5-Enforced'}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground font-sans">State:</span>
								<span className="text-emerald-700 font-bold font-sans">CONFIRMED (Zero Duplicate Risk)</span>
							</div>
						</div>
					</CardContent>
					<CardFooter className="flex justify-between border-t pt-4">
						<Link href="/ledger">
							<Button variant="outline" size="sm" className="text-xs gap-1.5">
								<FileCheck className="w-3.5 h-3.5 text-emerald-600" />
								<span>View in Merchant Audit Ledger</span>
							</Button>
						</Link>
						<Link href="/">
							<Button size="sm" className="text-xs">
								Back to Portal
							</Button>
						</Link>
					</CardFooter>
				</Card>
			)}
		</div>
	);
}
