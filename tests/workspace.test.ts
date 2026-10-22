import { describe, it, expect, beforeEach } from 'vitest';
import {
	signWorkspaceId,
	verifyWorkspaceId,
	createDefaultSeedData,
	resetWorkspace,
	createReturnCase,
	getCaseById,
} from '@/lib/workspace';

describe('Workspace Isolation & Hardening (P6.1)', () => {
	const wsA = 'ws_alpha_user_session';
	const wsB = 'ws_beta_user_session';

	beforeEach(async () => {
		await resetWorkspace(wsA);
		await resetWorkspace(wsB);
	});

	it('signs and verifies workspace cookie with HMAC-SHA256, rejecting tampered signatures', () => {
		const rawId = 'ws_12345678abcdef01';
		const signed = signWorkspaceId(rawId);

		expect(signed).toContain('.');
		const verified = verifyWorkspaceId(signed);
		expect(verified).toBe(rawId);

		// Tampering test: modify signature
		const tampered = signed.slice(0, -4) + '0000';
		expect(verifyWorkspaceId(tampered)).toBeNull();

		// Tampering test: modify payload
		const tamperedPayload = 'ws_differentId.' + signed.split('.')[1];
		expect(verifyWorkspaceId(tamperedPayload)).toBeNull();

		// Invalid format
		expect(verifyWorkspaceId('no-signature-dot')).toBeNull();
	});

	it('enforces total isolation between two concurrent visitor workspaces', async () => {
		const caseA = await createReturnCase(wsA, `order-101-${wsA.slice(0, 6)}`);

		// Workspace A has caseA
		expect(getCaseById(wsA, caseA.id)).toBeDefined();

		// Workspace B must not see caseA
		expect(getCaseById(wsB, caseA.id)).toBeUndefined();
	});

	it('reset restores clean seed data and clears cases and refunds', async () => {
		const caseA = await createReturnCase(wsA, `order-101-${wsA.slice(0, 6)}`);
		expect(getCaseById(wsA, caseA.id)).toBeDefined();

		// Reset workspace
		const freshWs = await resetWorkspace(wsA);
		expect(freshWs.cases).toHaveLength(0);
		expect(freshWs.refunds).toHaveLength(0);
		expect(freshWs.orders.length).toBeGreaterThanOrEqual(3);
		expect(getCaseById(wsA, caseA.id)).toBeUndefined();
	});

	it('initializes default 60-minute expiry on seed data', () => {
		const seed = createDefaultSeedData('ws_expiry_test');
		const diffMs = seed.expiresAt.getTime() - seed.createdAt.getTime();
		expect(diffMs).toBe(60 * 60 * 1000); // exactly 60 minutes
	});
});
