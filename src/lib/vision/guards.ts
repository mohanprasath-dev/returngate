import { VisionOutput, visionOutputSchema } from './schema';

/**
 * Strips imperative prompt injection commands and harmful imperative phrases from notes.
 * Notes are display-only and must never be parsed into logic.
 */
export function sanitizeVisionNotes(rawNotes: string): string {
	if (!rawNotes || typeof rawNotes !== 'string') {
		return '';
	}

	// 1. Remove dangerous control characters and html/script tags
	let cleaned = rawNotes.replace(/<[^>]*>/g, '').replace(/[\r\n\t]+/g, ' ');

	// 2. Strip imperative prompt injection patterns (case-insensitive)
	const forbiddenImperatives = [
		/\bignore (all )?(previous|prior) (instructions|rules|prompts)\b/gi,
		/\b(system prompt|system message|jailbreak)\b/gi,
		/\brefund\s+[\$\d\.]+/gi,
		/\b(approve|auto_offer|grant)\s+(refund|claim|money|payment)\b/gi,
		/\byou must\b/gi,
		/\boverride\b/gi,
		/\bact as\b/gi,
	];

	for (const pattern of forbiddenImperatives) {
		cleaned = cleaned.replace(pattern, '[filtered]');
	}

	// 3. Enforce strict character limit of 200 characters
	cleaned = cleaned.trim().slice(0, 200);

	return cleaned;
}

/**
 * Validates untrusted model JSON output against the strict vision schema,
 * rejects any extra fields or amounts, and sanitizes display notes.
 */
export function validateAndSanitizeVisionOutput(untrustedOutput: unknown): VisionOutput {
	// 1. Validate against strict schema (rejects any extra keys, including 'amount')
	const parsed = visionOutputSchema.parse(untrustedOutput);

	// 2. Sanitize display notes
	return {
		...parsed,
		notes: sanitizeVisionNotes(parsed.notes),
	};
}
