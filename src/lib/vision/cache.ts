import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { VisionOutput } from './schema';

const inMemoryVisionCache = new Map<string, VisionOutput>();

export function clearInMemoryVisionCache(): void {
	inMemoryVisionCache.clear();
}

/**
 * Computes deterministic SHA-256 hash of an image buffer or base64 string.
 */
export function computeImageSha256(image: Buffer | string): string {
	const buffer = Buffer.isBuffer(image) ? image : Buffer.from(image, 'base64');
	return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Retrieves cached vision evaluation by SHA-256 hash.
 */
export async function getCachedVisionResult(
	sha256: string,
	prismaClient = prisma,
): Promise<VisionOutput | null> {
	// 1. Check in-memory cache first
	if (inMemoryVisionCache.has(sha256)) {
		return inMemoryVisionCache.get(sha256)!;
	}

	// 2. Check DB
	try {
		const cached = await prismaClient.visionCache.findUnique({
			where: { imageSha256: sha256 },
		});

		if (cached && cached.resultJson) {
			const parsed = cached.resultJson as unknown as VisionOutput;
			inMemoryVisionCache.set(sha256, parsed);
			return parsed;
		}
	} catch {
		// DB offline or test mode
	}

	return null;
}

/**
 * Stores vision evaluation by SHA-256 hash in both memory and VisionCache table.
 */
export async function setCachedVisionResult(
	sha256: string,
	result: VisionOutput,
	prismaClient = prisma,
): Promise<void> {
	inMemoryVisionCache.set(sha256, result);

	try {
		await prismaClient.visionCache.upsert({
			where: { imageSha256: sha256 },
			update: { resultJson: result as any },
			create: { imageSha256: sha256, resultJson: result as any },
		});
	} catch {
		// DB offline or test mode
	}
}
