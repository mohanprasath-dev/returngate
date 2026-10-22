import type { Metadata } from 'next';
import './globals.css';
import { Geist } from 'next/font/google';
import { cn } from '@/lib/utils';
import { JudgeBar } from '@/components/judge-bar';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
	title: 'ReturnGate - Merchant-Controlled Pre-Label Keep-It Partial Refunds',
	description: 'Merchant-controlled keep-it partial refund engine on PayPal Orders v2 and Payments v2',
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en" className={cn('font-sans antialiased', geist.variable)}>
			<body className="min-h-screen bg-background text-foreground flex flex-col">
				<JudgeBar />
				<main className="flex-1">{children}</main>
			</body>
		</html>
	);
}

