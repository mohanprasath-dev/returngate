import { describe, expect, it } from 'vitest';
import {
	generate6DigitNonce,
	NONCE_EXPIRY_MS,
	NonceRecord,
	verifyNonceRecord,
} from '@/lib/engine/nonce';

describe('Nonce Service (Deterministic Challenge)', () => {
	it('generates a 6 digit numeric string between 100000 and 999999', () => {
		for (let i = 0; i < 50; i++) {
			const nonce = generate6DigitNonce();
			expect(nonce).toMatch(/^\d{6}$/);
			const num = parseInt(nonce, 10);
			expect(num).toBeGreaterThanOrEqual(100000);
			expect(num).toBeLessThan(1000000);
		}
	});

	it('accepts a valid, unexpired, unused nonce for the matching case', () => {
		const now = new Date('2026-10-22T10:00:00Z');
		const record: NonceRecord = {
			nonce: '482915',
			caseId: 'CASE-001',
			expiresAt: new Date(now.getTime() + NONCE_EXPIRY_MS),
			usedAt: null,
		};

		const check = verifyNonceRecord({
			record,
			inputCaseId: 'CASE-001',
			candidateNonce: '482915',
			now: new Date('2026-10-22T10:05:00Z'),
		});

		expect(check.valid).toBe(true);
	});

	it('rejects an expired nonce', () => {
		const now = new Date('2026-10-22T10:00:00Z');
		const record: NonceRecord = {
			nonce: '482915',
			caseId: 'CASE-001',
			expiresAt: new Date(now.getTime() + NONCE_EXPIRY_MS), // expires at 10:10:00Z
			usedAt: null,
		};

		// 11 minutes later
		const check = verifyNonceRecord({
			record,
			inputCaseId: 'CASE-001',
			candidateNonce: '482915',
			now: new Date('2026-10-22T10:11:00Z'),
		});

		expect(check.valid).toBe(false);
		expect(check.reason).toContain('expired');
	});

	it('rejects an already used nonce (replay prevention)', () => {
		const now = new Date('2026-10-22T10:00:00Z');
		const record: NonceRecord = {
			nonce: '482915',
			caseId: 'CASE-001',
			expiresAt: new Date(now.getTime() + NONCE_EXPIRY_MS),
			usedAt: new Date('2026-10-22T10:02:00Z'), // marked used
		};

		const check = verifyNonceRecord({
			record,
			inputCaseId: 'CASE-001',
			candidateNonce: '482915',
			now: new Date('2026-10-22T10:03:00Z'),
		});

		expect(check.valid).toBe(false);
		expect(check.reason).toContain('already been used');
	});

	it('rejects cross-case use (nonce bound to different case id)', () => {
		const now = new Date('2026-10-22T10:00:00Z');
		const record: NonceRecord = {
			nonce: '482915',
			caseId: 'CASE-001',
			expiresAt: new Date(now.getTime() + NONCE_EXPIRY_MS),
			usedAt: null,
		};

		const check = verifyNonceRecord({
			record,
			inputCaseId: 'CASE-OTHER-999',
			candidateNonce: '482915',
			now: new Date('2026-10-22T10:02:00Z'),
		});

		expect(check.valid).toBe(false);
		expect(check.reason).toContain('different return case');
	});

	it('rejects incorrect candidate nonce code', () => {
		const now = new Date('2026-10-22T10:00:00Z');
		const record: NonceRecord = {
			nonce: '482915',
			caseId: 'CASE-001',
			expiresAt: new Date(now.getTime() + NONCE_EXPIRY_MS),
			usedAt: null,
		};

		const check = verifyNonceRecord({
			record,
			inputCaseId: 'CASE-001',
			candidateNonce: '000000',
			now: new Date('2026-10-22T10:02:00Z'),
		});

		expect(check.valid).toBe(false);
		expect(check.reason).toContain('does not match');
	});
});
