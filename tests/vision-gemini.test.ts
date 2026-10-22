import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateEngineDecision } from '@/lib/engine/offer';
import { clearInMemoryRateLimits } from '@/lib/limits';
import { clearInMemoryVisionCache } from '@/lib/vision/cache';
import { analyzeItemPhoto, MANUAL_REVIEW_FALLBACK } from '@/lib/vision/gemini';

describe('Gemini Vision Pipeline with Caching and Caps (PRD Section 7 & Task P3.2)', () => {
	beforeEach(() => {
		clearInMemoryVisionCache();
		clearInMemoryRateLimits();
		vi.restoreAllMocks();
	});

	const dummyBase64 = Buffer.from('test-image-content-bytes-12345').toString('base64');

	const mockVisionOutput = {
		nonce_visible: true,
		sku_match: true,
		screen_capture_suspected: false,
		injected_text_detected: false,
		defect_class: 'COSMETIC_MINOR',
		confidence: 0.94,
		notes: 'Minor surface scratch detected near base',
	};

	it('Same image twice causes one model call (SHA-256 caching)', async () => {
		let modelCallCount = 0;
		const mockCallModelFn = vi.fn().mockImplementation(() => {
			modelCallCount++;
			return Promise.resolve(mockVisionOutput);
		});

		// Call 1
		const res1 = await analyzeItemPhoto({
			imageBase64: dummyBase64,
			expectedNonce: '123456',
			callModelFn: mockCallModelFn,
		});

		expect(res1.isCached).toBe(false);
		expect(res1.output.defect_class).toBe('COSMETIC_MINOR');
		expect(modelCallCount).toBe(1);

		// Call 2 with identical image
		const res2 = await analyzeItemPhoto({
			imageBase64: dummyBase64,
			expectedNonce: '123456',
			callModelFn: mockCallModelFn,
		});

		expect(res2.isCached).toBe(true);
		expect(res2.output.defect_class).toBe('COSMETIC_MINOR');
		expect(modelCallCount).toBe(1); // Model was NOT called again
	});

	it('Hitting the cap causes MANUAL_REVIEW, never an offer', async () => {
		const mockCallModelFn = vi.fn().mockResolvedValue(mockVisionOutput);

		// Simulate exhaustively reaching the hourly cap of 2 requests
		process.env.VISION_PER_IP_HOURLY = '2';

		const img1 = Buffer.from('unique-image-1').toString('base64');
		const img2 = Buffer.from('unique-image-2').toString('base64');
		const img3 = Buffer.from('unique-image-3').toString('base64');

		await analyzeItemPhoto({ imageBase64: img1, callModelFn: mockCallModelFn });
		await analyzeItemPhoto({ imageBase64: img2, callModelFn: mockCallModelFn });

		// 3rd call exceeds cap
		const cappedRes = await analyzeItemPhoto({
			imageBase64: img3,
			callModelFn: mockCallModelFn,
		});

		expect(cappedRes.isFallback).toBe(true);
		expect(cappedRes.reason).toContain('Hourly vision request cap');

		// Now pass capped result to deterministic offer engine
		const engineDecision = evaluateEngineDecision({
			capturedCents: 5000,
			remainingRefundableCents: 5000,
			policy: {
				capCents: 2500,
				minorPercent: 20,
				salvageCents: 0,
				returnShippingCents: 600,
				handlingCents: 200,
				minSavingsCents: 300,
				minConfidence: 0.8,
				enabled: true,
			},
			vision: cappedRes.output,
			isNonceValid: true,
		});

		// INVARIANT: Hitting the cap MUST cause MANUAL_REVIEW, never an offer
		expect(engineDecision.decision).toBe('MANUAL_REVIEW');
		expect(engineDecision.offerCents).toBe(0);
		expect(engineDecision.decision).not.toBe('AUTO_OFFER');

		delete process.env.VISION_PER_IP_HOURLY;
	});

	it('Model error or timeout safely falls back to MANUAL_REVIEW', async () => {
		const mockFailingModelFn = vi.fn().mockRejectedValue(new Error('503 Service Unavailable'));

		const res = await analyzeItemPhoto({
			imageBase64: Buffer.from('broken-image').toString('base64'),
			callModelFn: mockFailingModelFn,
		});

		expect(res.isFallback).toBe(true);
		expect(res.output.defect_class).toBe('UNCLEAR');
		expect(res.output.confidence).toBe(0);

		const engineDecision = evaluateEngineDecision({
			capturedCents: 5000,
			remainingRefundableCents: 5000,
			policy: {
				capCents: 2500,
				minorPercent: 20,
				salvageCents: 0,
				returnShippingCents: 600,
				handlingCents: 200,
				minSavingsCents: 300,
				minConfidence: 0.8,
				enabled: true,
			},
			vision: res.output,
			isNonceValid: true,
		});

		expect(engineDecision.decision).toBe('MANUAL_REVIEW');
		expect(engineDecision.offerCents).toBe(0);
	});
});
