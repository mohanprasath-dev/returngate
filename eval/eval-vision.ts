import fs from 'node:fs';
import path from 'node:path';
import {
	evaluateEngineDecision,
	EngineDecisionType,
	EnginePolicy,
} from '../src/lib/engine/offer';
import { VisionOutput } from '../src/lib/vision/schema';
import { analyzeImageEvidence } from '../src/lib/vision/gemini';

interface EvalCase {
	id: string;
	filename: string;
	description: string;
	expected_vision: VisionOutput;
	expected_decision: EngineDecisionType;
}

const DEFAULT_TEST_POLICY: EnginePolicy = {
	capCents: 2000, // $20.00 cap
	minorPercent: 20, // 20%
	salvageCents: 500, // $5.00
	returnShippingCents: 600, // $6.00
	handlingCents: 400, // $4.00
	minSavingsCents: 300, // $3.00
	minConfidence: 0.8,
	enabled: true,
};

async function runEval(): Promise<void> {
	const evalDir = path.resolve(process.cwd(), 'eval');
	const expectedJsonPath = path.join(evalDir, 'expected.json');

	if (!fs.existsSync(expectedJsonPath)) {
		console.error('Missing eval/expected.json');
		process.exit(1);
	}

	const rawExpected = fs.readFileSync(expectedJsonPath, 'utf8');
	const testCases: EvalCase[] = JSON.parse(rawExpected);

	console.log('='.repeat(90));
	console.log('ReturnGate - Adversarial Vision & Offer Engine Evaluation Suite');
	console.log('='.repeat(90));
	console.log(`Loaded ${testCases.length} adversarial and clean evaluation cases.\n`);

	let passedCount = 0;
	let failedCount = 0;
	let unauthorizedAutoOfferCount = 0;

	console.log(
		'| ' +
			'Case ID'.padEnd(23) +
			' | ' +
			'Expected'.padEnd(14) +
			' | ' +
			'Actual'.padEnd(14) +
			' | ' +
			'Offer'.padEnd(8) +
			' | ' +
			'Status'.padEnd(6) +
			' |'
	);
	console.log('|-'.padEnd(25, '-') + '+-'.padEnd(16, '-') + '+-'.padEnd(16, '-') + '+-'.padEnd(10, '-') + '+-'.padEnd(8, '-') + '|');

	for (const testCase of testCases) {
		const filePath = path.join(evalDir, testCase.filename);
		let imageBuffer: Buffer;

		if (fs.existsSync(filePath)) {
			imageBuffer = fs.readFileSync(filePath);
		} else {
			imageBuffer = Buffer.from('placeholder');
		}

		let vision: VisionOutput;
		if (process.env.EVAL_USE_REAL_GEMINI === 'true' && process.env.GEMINI_API_KEY) {
			vision = await analyzeImageEvidence({
				imageBuffer,
				mimeType: 'image/jpeg',
				clientIp: `127.0.0.${Math.floor(Math.random() * 200)}`,
			});
		} else {
			vision = testCase.expected_vision;
		}

		// Run deterministic offer engine
		const offerResult = evaluateEngineDecision({
			capturedCents: 5000,
			remainingRefundableCents: 5000,
			policy: DEFAULT_TEST_POLICY,
			vision,
			isNonceValid: vision.nonce_visible,
		});

		const actualDecision = offerResult.decision;
		const isCleanMinor = testCase.id.startsWith('clean-minor-scratch');

		// Acceptance rule: Zero AUTO_OFFER on any case other than clean minor-scratch cases
		if (!isCleanMinor && actualDecision === 'AUTO_OFFER') {
			unauthorizedAutoOfferCount++;
		}

		const isPass = actualDecision === testCase.expected_decision;
		if (isPass) {
			passedCount++;
		} else {
			failedCount++;
		}

		const offerStr = `$${(offerResult.offerCents / 100).toFixed(2)}`;
		const statusStr = isPass ? 'PASS' : 'FAIL';

		console.log(
			'| ' +
				testCase.id.padEnd(23) +
				' | ' +
				testCase.expected_decision.padEnd(14) +
				' | ' +
				actualDecision.padEnd(14) +
				' | ' +
				offerStr.padEnd(8) +
				' | ' +
				statusStr.padEnd(6) +
				' |'
		);
	}

	console.log('='.repeat(90));
	console.log(`Results: ${passedCount} PASSED, ${failedCount} FAILED.`);
	console.log(`Unauthorized AUTO_OFFER on adversarial/unclear cases: ${unauthorizedAutoOfferCount}`);
	console.log('='.repeat(90));

	if (unauthorizedAutoOfferCount > 0) {
		console.error('\nCRITICAL FAILURE: Zero AUTO_OFFER allowed on adversarial cases!');
		process.exit(1);
	}

	if (failedCount > 0) {
		console.error('\nEvaluation suite encountered mismatches.');
		process.exit(1);
	}

	console.log('\nAcceptance Criteria Verified: Zero AUTO_OFFER on any case other than clean minor scratches.\n');
}

runEval().catch((err) => {
	console.error('Eval failed with unexpected error:', err);
	process.exit(1);
});
