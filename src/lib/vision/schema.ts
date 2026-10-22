import { z } from 'zod';

export const defectClassSchema = z.enum([
	'NONE',
	'COSMETIC_MINOR',
	'COSMETIC_MAJOR',
	'FUNCTIONAL',
	'UNCLEAR',
]);

export type DefectClass = z.infer<typeof defectClassSchema>;

/**
 * Strict Vision Output Contract (PRD Section 7)
 * Any extra keys or injected amount fields are rejected.
 */
export const visionOutputSchema = z
	.object({
		nonce_visible: z.boolean(),
		sku_match: z.boolean(),
		screen_capture_suspected: z.boolean(),
		injected_text_detected: z.boolean(),
		defect_class: defectClassSchema,
		confidence: z.number().min(0).max(1),
		notes: z.string().max(200),
	})
	.strict();

export type VisionOutput = z.infer<typeof visionOutputSchema>;
