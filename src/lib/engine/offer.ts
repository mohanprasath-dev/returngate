export type DefectClass =
	| 'NONE'
	| 'COSMETIC_MINOR'
	| 'COSMETIC_MAJOR'
	| 'FUNCTIONAL'
	| 'UNCLEAR';

export interface VisionFlags {
	nonce_visible: boolean;
	sku_match: boolean;
	screen_capture_suspected: boolean;
	injected_text_detected: boolean;
	defect_class: DefectClass;
	confidence: number; // 0..1
	notes?: string;
}

export interface EnginePolicy {
	capCents: number;
	minorPercent: number; // e.g. 20 for 20%
	salvageCents: number;
	returnShippingCents: number;
	handlingCents: number;
	minSavingsCents: number;
	minConfidence: number; // 0..1
	enabled?: boolean;
}

export interface EngineDecisionInput {
	capturedCents: number;
	remainingRefundableCents: number;
	policy: EnginePolicy;
	vision: VisionFlags;
	isNonceValid: boolean;
	priorRefundsCountOnCapture?: number;
	priorRefundsMaxAllowed?: number;
}

export type EngineDecisionType = 'AUTO_OFFER' | 'MANUAL_REVIEW' | 'FULL_RETURN_ONLY';

export interface EngineDecisionOutput {
	decision: EngineDecisionType;
	offerCents: number;
	reason: string;
	calculations?: {
		severityCents: number;
		avoidedCost: number;
		netCappedOffer: number;
	};
}

/**
 * Pure function: calculates offer amount strictly in integer cents.
 * Vision never inputs or influences the amount directly.
 */
export function calculateOfferAmountCents(
	capturedCents: number,
	remainingRefundableCents: number,
	policy: EnginePolicy,
): { offerCents: number; severityCents: number; avoidedCost: number; netCappedOffer: number } {
	// Severity calculation
	const severityCents = Math.floor((capturedCents * policy.minorPercent) / 100);

	// Avoided return cost economics
	const avoidedCost =
		capturedCents - policy.salvageCents + policy.returnShippingCents + policy.handlingCents;

	// Net allowable refund ensuring merchant minSavingsCents
	const maxAllowableFromAvoidedCost = avoidedCost - policy.minSavingsCents;

	// Clamped offer cents: cannot exceed severity, merchant cap, remaining refundable, or avoided cost limit
	const netCappedOffer = Math.min(
		severityCents,
		policy.capCents,
		remainingRefundableCents,
		maxAllowableFromAvoidedCost,
	);

	const offerCents = Math.max(0, netCappedOffer);

	return {
		offerCents,
		severityCents,
		avoidedCost,
		netCappedOffer,
	};
}

/**
 * Pure function: deterministic decision engine adhering to PRD Section 5.
 */
export function evaluateEngineDecision(input: EngineDecisionInput): EngineDecisionOutput {
	const {
		capturedCents,
		remainingRefundableCents,
		policy,
		vision,
		isNonceValid,
		priorRefundsCountOnCapture = 0,
		priorRefundsMaxAllowed = 1,
	} = input;

	const { offerCents, severityCents, avoidedCost, netCappedOffer } = calculateOfferAmountCents(
		capturedCents,
		remainingRefundableCents,
		policy,
	);

	const calculations = { severityCents, avoidedCost, netCappedOffer };

	// 1. Policy disabled
	if (policy.enabled === false) {
		return {
			decision: 'MANUAL_REVIEW',
			offerCents: 0,
			reason: 'Merchant keep-it policy is disabled',
			calculations,
		};
	}

	// 2. Nonce verification guard
	if (!isNonceValid) {
		return {
			decision: 'MANUAL_REVIEW',
			offerCents: 0,
			reason: 'Nonce is invalid, expired, already used, or mismatched',
			calculations,
		};
	}

	// 3. Vision tamper or injection flags
	if (vision.screen_capture_suspected || vision.injected_text_detected) {
		return {
			decision: 'MANUAL_REVIEW',
			offerCents: 0,
			reason: 'Adversarial photo anomaly suspected (screen capture or text injection)',
			calculations,
		};
	}

	// 4. Item / SKU match guard
	if (!vision.sku_match) {
		return {
			decision: 'MANUAL_REVIEW',
			offerCents: 0,
			reason: 'Photo item does not match order SKU',
			calculations,
		};
	}

	// 5. Nonce visible in photo guard
	if (!vision.nonce_visible) {
		return {
			decision: 'MANUAL_REVIEW',
			offerCents: 0,
			reason: 'Single-use nonce challenge not visible in photo',
			calculations,
		};
	}

	// 6. Confidence threshold guard
	if (vision.confidence < policy.minConfidence) {
		return {
			decision: 'MANUAL_REVIEW',
			offerCents: 0,
			reason: `Vision confidence ${vision.confidence.toFixed(2)} is below merchant threshold ${policy.minConfidence.toFixed(2)}`,
			calculations,
		};
	}

	// 7. Defect classification checks
	if (
		vision.defect_class === 'COSMETIC_MAJOR' ||
		vision.defect_class === 'FUNCTIONAL'
	) {
		return {
			decision: 'FULL_RETURN_ONLY',
			offerCents: 0,
			reason: `Defect severity (${vision.defect_class}) requires full physical item return`,
			calculations,
		};
	}

	if (vision.defect_class !== 'COSMETIC_MINOR') {
		return {
			decision: 'MANUAL_REVIEW',
			offerCents: 0,
			reason: `Defect class ${vision.defect_class} requires manual review`,
			calculations,
		};
	}

	// 8. Prior refund limits on this capture
	if (priorRefundsCountOnCapture >= priorRefundsMaxAllowed) {
		return {
			decision: 'MANUAL_REVIEW',
			offerCents: 0,
			reason: 'Prior keep-it refund limit reached for this order capture',
			calculations,
		};
	}

	// 9. Offer economics: must be strictly positive
	if (offerCents <= 0) {
		return {
			decision: 'FULL_RETURN_ONLY',
			offerCents: 0,
			reason: 'Avoided cost economics or cap limits yield non-positive refund amount',
			calculations,
		};
	}

	// All guards passed
	return {
		decision: 'AUTO_OFFER',
		offerCents,
		reason: 'All automated guards passed: capped keep-it partial refund approved',
		calculations,
	};
}
