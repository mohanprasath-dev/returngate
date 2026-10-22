'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	RotateCcw,
	Copy,
	Check,
	Sliders,
	Inbox,
	FileText,
	ExternalLink,
	AlertTriangle,
} from 'lucide-react';

export function JudgeBar() {
	const pathname = usePathname();
	const [copiedField, setCopiedField] = useState<string | null>(null);
	const [isResetting, setIsResetting] = useState(false);
	const [mockFailureActive, setMockFailureActive] = useState(false);

	const buyerEmail = process.env.NEXT_PUBLIC_SANDBOX_BUYER_EMAIL || 'sb-buyer@business.example.com';
	const buyerPassword = process.env.NEXT_PUBLIC_SANDBOX_BUYER_PASSWORD || 'SandboxPass123!';

	const copyToClipboard = (text: string, field: string) => {
		navigator.clipboard.writeText(text);
		setCopiedField(field);
		setTimeout(() => setCopiedField(null), 2000);
	};

	const handleReset = async () => {
		if (confirm('Reset demo workspace to fresh seed data? This clears cases and refunds for your session.')) {
			setIsResetting(true);
			try {
				await fetch('/api/workspace/reset', { method: 'POST' });
				window.location.href = '/';
			} catch (e) {
				console.error(e);
			} finally {
				setIsResetting(false);
			}
		}
	};

	const toggleMockFailure = () => {
		const nextState = !mockFailureActive;
		setMockFailureActive(nextState);
		if (typeof window !== 'undefined') {
			if (nextState) {
				sessionStorage.setItem('rg_mock_paypal_failure', 'true');
			} else {
				sessionStorage.removeItem('rg_mock_paypal_failure');
			}
		}
	};

	return (
		<header className="border-b bg-card/80 backdrop-blur sticky top-0 z-50">
			{/* Top Judge Banner */}
			<div className="bg-slate-900 text-slate-100 text-xs py-1.5 px-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800">
				<div className="flex items-center gap-2">
					<span className="font-semibold tracking-wider text-amber-400 uppercase text-[10px] bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800/60">
						Judge Sandbox Workspace
					</span>
					<span className="text-slate-400 hidden sm:inline">
						Pre-label keep-it partial refunds on PayPal Orders v2 & Payments v2
					</span>
				</div>

				<div className="flex items-center gap-3">
					<div className="flex items-center gap-1.5 bg-slate-800/90 px-2 py-0.5 rounded text-[11px] border border-slate-700">
						<span className="text-slate-400">Buyer Login:</span>
						<span className="font-mono text-slate-200">{buyerEmail}</span>
						<button
							onClick={() => copyToClipboard(buyerEmail, 'email')}
							className="text-slate-400 hover:text-white p-0.5 transition-colors"
							title="Copy email"
						>
							{copiedField === 'email' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
						</button>
					</div>

					<div className="flex items-center gap-1.5 bg-slate-800/90 px-2 py-0.5 rounded text-[11px] border border-slate-700">
						<span className="text-slate-400">Pass:</span>
						<span className="font-mono text-slate-200">{buyerPassword}</span>
						<button
							onClick={() => copyToClipboard(buyerPassword, 'pass')}
							className="text-slate-400 hover:text-white p-0.5 transition-colors"
							title="Copy password"
						>
							{copiedField === 'pass' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
						</button>
					</div>

					<button
						onClick={toggleMockFailure}
						className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border transition-colors ${
							mockFailureActive
								? 'bg-rose-950 border-rose-500 text-rose-300 font-medium'
								: 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
						}`}
						title="Toggle PayPal-Mock-Response 422 failure simulation for testing error handling"
					>
						<AlertTriangle className="w-3 h-3" />
						<span>{mockFailureActive ? 'Mock 422 Active' : 'Simulate 422'}</span>
					</button>

					<Button
						variant="ghost"
						size="xs"
						onClick={handleReset}
						disabled={isResetting}
						className="text-slate-300 hover:text-white hover:bg-slate-800 h-6 px-2 text-xs"
					>
						<RotateCcw className={`w-3 h-3 mr-1 ${isResetting ? 'animate-spin' : ''}`} />
						Reset
					</Button>
				</div>
			</div>

			{/* Main Navigation Bar */}
			<div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
				<div className="flex items-center gap-6">
					<Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
						<span className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-sm font-extrabold shadow-sm">
							RG
						</span>
						<span>ReturnGate</span>
					</Link>

					<nav className="hidden md:flex items-center gap-1 text-sm font-medium">
						<Link
							href="/"
							className={`px-3 py-1.5 rounded-md transition-colors ${
								pathname === '/' ? 'bg-secondary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
							}`}
						>
							Buyer Portal
						</Link>
						<Link
							href="/policy"
							className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
								pathname === '/policy' ? 'bg-secondary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
							}`}
						>
							<Sliders className="w-3.5 h-3.5" />
							Merchant Policy
						</Link>
						<Link
							href="/queue"
							className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
								pathname === '/queue' ? 'bg-secondary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
							}`}
						>
							<Inbox className="w-3.5 h-3.5" />
							Review Queue
						</Link>
						<Link
							href="/ledger"
							className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
								pathname === '/ledger' ? 'bg-secondary text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
							}`}
						>
							<FileText className="w-3.5 h-3.5" />
							Refund Ledger
						</Link>
					</nav>
				</div>

				<div className="flex items-center gap-3">
					<Badge variant="outline" className="hidden sm:inline-flex text-xs py-0.5 font-mono">
						US Sandbox | Intent CAPTURE
					</Badge>
					<Link
						href="https://github.com"
						target="_blank"
						rel="noreferrer"
						className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
					>
						<span>Docs</span>
						<ExternalLink className="w-3 h-3" />
					</Link>
				</div>
			</div>
		</header>
	);
}
