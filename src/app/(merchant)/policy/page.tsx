'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { calculateOfferAmountCents, EnginePolicy } from '@/lib/engine/offer';
import {
	Sliders,
	Save,
	CheckCircle2,
	Calculator,
} from 'lucide-react';

export default function MerchantPolicyPage() {
	const [policy, setPolicy] = useState<EnginePolicy>({
		capCents: 2500,
		minorPercent: 20,
		salvageCents: 0,
		returnShippingCents: 600,
		handlingCents: 200,
		minSavingsCents: 300,
		minConfidence: 0.8,
		enabled: true,
	});

	const [sampleCapturedCents, setSampleCapturedCents] = useState<number>(8500); // $85.00
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [saveSuccess, setSaveSuccess] = useState(false);

	useEffect(() => {
		fetch('/api/merchant/policy')
			.then((res) => res.json())
			.then((data) => {
				if (data.policy) {
					setPolicy(data.policy);
				}
			})
			.catch((err) => console.error(err))
			.finally(() => setIsLoading(false));
	}, []);

	// Live calculations using the exact engine function
	const previewCalc = calculateOfferAmountCents(
		sampleCapturedCents,
		sampleCapturedCents,
		policy,
	);

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsSaving(true);
		setSaveSuccess(false);

		try {
			const res = await fetch('/api/merchant/policy', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(policy),
			});
			if (res.ok) {
				setSaveSuccess(true);
				setTimeout(() => setSaveSuccess(false), 3000);
			} else {
				alert('Failed to update policy');
			}
		} catch (err) {
			console.error(err);
			alert('Network error updating policy');
		} finally {
			setIsSaving(false);
		}
	};

	if (isLoading) {
		return <div className="max-w-4xl mx-auto py-16 text-center text-sm text-muted-foreground">Loading merchant policy...</div>;
	}

	return (
		<div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
			{/* Page Header */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b">
				<div>
					<h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
						<Sliders className="w-6 h-6 text-primary" />
						<span>Merchant Policy & Unit Economics</span>
					</h1>
					<p className="text-xs sm:text-sm text-muted-foreground mt-1">
						Define pre-approved parameters for keep-it partial refunds. Offers are strictly bounded by your cost inputs.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Badge variant={policy.enabled ? 'success' : 'outline'}>
						{policy.enabled ? 'Keep-It Workflow Active' : 'Workflow Disabled'}
					</Badge>
				</div>
			</div>

			{saveSuccess && (
				<div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
					<CheckCircle2 className="w-4 h-4 text-emerald-600" />
					<span>Merchant policy updated successfully. Live preview reflects active parameters.</span>
				</div>
			)}

			<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
				{/* Policy Configuration Form */}
				<form onSubmit={handleSave} className="lg:col-span-7 space-y-6">
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base">Bounded Offer Thresholds</CardTitle>
							<CardDescription className="text-xs">
								Amounts are converted and stored strictly in integer cents.
							</CardDescription>
						</CardHeader>

						<CardContent className="space-y-4 text-xs">
							{/* Cap */}
							<div className="space-y-1.5">
								<div className="flex justify-between items-center">
									<Label htmlFor="capCents" className="font-semibold text-xs">
										Maximum Keep-It Refund Cap ($)
									</Label>
									<span className="font-mono text-muted-foreground text-[11px]">
										{(policy.capCents / 100).toFixed(2)} USD
									</span>
								</div>
								<Input
									id="capCents"
									type="number"
									step="0.50"
									min="1"
									value={(policy.capCents / 100).toString()}
									onChange={(e) =>
										setPolicy({ ...policy, capCents: Math.round(parseFloat(e.target.value || '0') * 100) })
									}
									required
								/>
								<p className="text-[10px] text-muted-foreground">
									Hard ceiling: no keep-it partial refund can ever exceed this dollar cap, regardless of defect or item value.
								</p>
							</div>

							{/* Minor defect percentage */}
							<div className="space-y-1.5">
								<div className="flex justify-between items-center">
									<Label htmlFor="minorPercent" className="font-semibold text-xs">
										Minor Defect Severity Rate (%)
									</Label>
									<span className="font-mono text-muted-foreground text-[11px]">
										{policy.minorPercent}% of captured total
									</span>
								</div>
								<Input
									id="minorPercent"
									type="number"
									min="1"
									max="100"
									value={policy.minorPercent.toString()}
									onChange={(e) =>
										setPolicy({ ...policy, minorPercent: parseInt(e.target.value || '0', 10) })
									}
									required
								/>
								<p className="text-[10px] text-muted-foreground">
									Fraction of item price offered when a minor cosmetic blemish is verified.
								</p>
							</div>

							<div className="grid grid-cols-2 gap-4 pt-2 border-t">
								{/* Return Shipping */}
								<div className="space-y-1.5">
									<Label htmlFor="returnShipping" className="font-semibold text-[11px]">
										Avoided Return Shipping ($)
									</Label>
									<Input
										id="returnShipping"
										type="number"
										step="0.50"
										min="0"
										value={(policy.returnShippingCents / 100).toString()}
										onChange={(e) =>
											setPolicy({
												...policy,
												returnShippingCents: Math.round(parseFloat(e.target.value || '0') * 100),
											})
										}
									/>
								</div>

								{/* Warehouse Handling */}
								<div className="space-y-1.5">
									<Label htmlFor="handling" className="font-semibold text-[11px]">
										Avoided Handling Fee ($)
									</Label>
									<Input
										id="handling"
										type="number"
										step="0.50"
										min="0"
										value={(policy.handlingCents / 100).toString()}
										onChange={(e) =>
											setPolicy({
												...policy,
												handlingCents: Math.round(parseFloat(e.target.value || '0') * 100),
											})
										}
									/>
								</div>
							</div>

							<div className="grid grid-cols-2 gap-4">
								{/* Min Required Savings */}
								<div className="space-y-1.5">
									<Label htmlFor="minSavings" className="font-semibold text-[11px]">
										Min Guaranteed Savings ($)
									</Label>
									<Input
										id="minSavings"
										type="number"
										step="0.50"
										min="0"
										value={(policy.minSavingsCents / 100).toString()}
										onChange={(e) =>
											setPolicy({
												...policy,
												minSavingsCents: Math.round(parseFloat(e.target.value || '0') * 100),
											})
										}
									/>
								</div>

								{/* Min AI Confidence */}
								<div className="space-y-1.5">
									<Label htmlFor="minConfidence" className="font-semibold text-[11px]">
										Min AI Confidence (0.5 - 1.0)
									</Label>
									<Input
										id="minConfidence"
										type="number"
										step="0.05"
										min="0.5"
										max="1.0"
										value={policy.minConfidence.toString()}
										onChange={(e) =>
											setPolicy({
												...policy,
												minConfidence: parseFloat(e.target.value || '0.8'),
											})
										}
									/>
								</div>
							</div>
						</CardContent>

						<CardFooter className="flex justify-between border-t pt-4">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="text-xs"
								onClick={() =>
									setPolicy({
										capCents: 2500,
										minorPercent: 20,
										salvageCents: 0,
										returnShippingCents: 600,
										handlingCents: 200,
										minSavingsCents: 300,
										minConfidence: 0.8,
										enabled: true,
									})
								}
							>
								Reset to Defaults
							</Button>
							<Button type="submit" size="sm" disabled={isSaving} className="text-xs gap-1.5">
								<Save className="w-3.5 h-3.5" />
								<span>{isSaving ? 'Saving Policy...' : 'Save Policy'}</span>
							</Button>
						</CardFooter>
					</Card>
				</form>

				{/* Live Real-Time Math Inspector */}
				<div className="lg:col-span-5 space-y-4">
					<Card className="border-2 border-slate-300 shadow-sm bg-slate-50/70">
						<CardHeader className="pb-3">
							<div className="flex items-center justify-between">
								<CardTitle className="text-base flex items-center gap-1.5">
									<Calculator className="w-4 h-4 text-primary" />
									<span>Live Unit Economics Preview</span>
								</CardTitle>
								<Badge variant="secondary" className="text-[10px] font-mono">
									Pure Function
								</Badge>
							</div>
							<CardDescription className="text-xs">
								Updates instantaneously as you edit inputs. Calculated by <code className="text-[10px]">calculateOfferAmountCents</code>.
							</CardDescription>
						</CardHeader>

						<CardContent className="space-y-4 text-xs">
							{/* Test Sample Order Selector */}
							<div className="space-y-1.5 bg-white p-3 rounded-lg border">
								<Label className="font-semibold text-slate-800 text-[11px]">Test Sample Order Value</Label>
								<div className="flex items-center gap-2">
									<Input
										type="number"
										step="5"
										min="10"
										value={(sampleCapturedCents / 100).toString()}
										onChange={(e) => setSampleCapturedCents(Math.round(parseFloat(e.target.value || '10') * 100))}
										className="h-8 text-xs font-mono"
									/>
									<span className="text-muted-foreground text-xs font-mono">USD</span>
								</div>
							</div>

							{/* Step-by-step Formula Breakdown */}
							<div className="space-y-2 bg-white p-3 rounded-lg border font-mono text-[11px]">
								<div className="flex justify-between py-1 border-b">
									<span className="text-muted-foreground font-sans">1. Severity (Price * {policy.minorPercent}%):</span>
									<span className="font-semibold text-slate-900">${(previewCalc.severityCents / 100).toFixed(2)}</span>
								</div>

								<div className="flex justify-between py-1 border-b">
									<span className="text-muted-foreground font-sans">2. Avoided Return Cost:</span>
									<span className="text-slate-900">${(previewCalc.avoidedCost / 100).toFixed(2)}</span>
								</div>

								<div className="flex justify-between py-1 border-b">
									<span className="text-muted-foreground font-sans">3. Avoided Cost - Min Savings:</span>
									<span className="text-slate-900">
										${((previewCalc.avoidedCost - policy.minSavingsCents) / 100).toFixed(2)}
									</span>
								</div>

								<div className="flex justify-between py-1 border-b">
									<span className="text-muted-foreground font-sans">4. Merchant Policy Cap:</span>
									<span className="text-slate-900">${(policy.capCents / 100).toFixed(2)}</span>
								</div>

								<div className="flex justify-between pt-2 text-xs font-bold text-emerald-700 font-sans">
									<span>Calculated Keep-It Offer:</span>
									<span className="font-mono text-sm">${(previewCalc.offerCents / 100).toFixed(2)} USD</span>
								</div>
							</div>

							<div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 text-[11px]">
								<div className="font-semibold mb-1">Invariance Proof:</div>
								Even if the order total is $1,000, the offer will never exceed the merchant cap of $
								{(policy.capCents / 100).toFixed(2)}.
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
