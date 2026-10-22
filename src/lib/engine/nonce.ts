import crypto from 'crypto';
import { prisma } from '@/lib/db';

export const NONCE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

export interface NonceRecord {
	nonce: string;
	caseId: string;
	expiresAt: Date;
	usedAt?: Date | null;
}

/**
 * Generates a cryptographically secure 6-digit numeric nonce.
 */
export function generate6DigitNonce(): string {
	const num = crypto.randomInt(100000, 1000000);
	return num.toString();
}

/**
 * Pure function to verify a nonce record against candidate input.
 */
export function verifyNonceRecord({
	record,
	inputCaseId,
	candidateNonce,
	now = new Date(),
}: {
	record: NonceRecord;
	inputCaseId: string;
	candidateNonce: string;
	now?: Date;
}): { valid: boolean; reason?: string } {
	// 1. Case ID binding check
	if (record.caseId !== inputCaseId) {
		return { valid: false, reason: 'Nonce belongs to a different return case' };
	}

	// 2. Nonce match
	if (record.nonce !== candidateNonce) {
		return { valid: false, reason: 'Nonce code does not match' };
	}

	// 3. Reuse check
	if (record.usedAt) {
		return { valid: false, reason: 'Nonce has already been used' };
	}

	// 4. Expiration check
	if (now.getTime() > record.expiresAt.getTime()) {
		return { valid: false, reason: 'Nonce has expired' };
	}

	return { valid: true };
}

/**
 * Database-backed: generates and stores a new nonce for a ReturnCase.
 */
export async function createNonceForCase(
	caseId: string,
	prismaClient = prisma,
	now = new Date(),
): Promise<{ nonce: string; expiresAt: Date }> {
	const nonce = generate6DigitNonce();
	const expiresAt = new Date(now.getTime() + NONCE_EXPIRY_MS);

	await prismaClient.returnCase.update({
		where: { id: caseId },
		data: {
			nonce,
			nonceExpiresAt: expiresAt,
			nonceUsedAt: null,
		},
	});

	return { nonce, expiresAt };
}

/**
 * Database-backed: verifies candidate nonce against database and marks used on consumption.
 */
export async function consumeNonceForCase(
	caseId: string,
	candidateNonce: string,
	prismaClient = prisma,
	now = new Date(),
): Promise<{ valid: boolean; reason?: string }> {
	const returnCase = await prismaClient.returnCase.findUnique({
		where: { id: caseId },
		select: {
			id: true,
			nonce: true,
			nonceExpiresAt: true,
			nonceUsedAt: true,
		},
	});

	if (!returnCase) {
		return { valid: false, reason: 'Return case not found' };
	}

	const record: NonceRecord = {
		nonce: returnCase.nonce,
		caseId: returnCase.id,
		expiresAt: returnCase.nonceExpiresAt,
		usedAt: returnCase.nonceUsedAt,
	};

	const verification = verifyNonceRecord({
		record,
		inputCaseId: caseId,
		candidateNonce,
		now,
	});

	if (!verification.valid) {
		return verification;
	}

	// Mark used
	await prismaClient.returnCase.update({
		where: { id: caseId },
		data: {
			nonceUsedAt: now,
		},
	});

	return { valid: true };
}
