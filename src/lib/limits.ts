import { prisma } from '@/lib/db';

export interface RateLimitCheckResult {
	allowed: boolean;
	reason?: string;
	currentCount?: number;
	maxAllowed?: number;
}

/**
 * In-memory fallback counter store for testing or offline environments
 */
const inMemoryCounters = new Map<string, number>();

export function clearInMemoryRateLimits(): void {
	inMemoryCounters.clear();
}

/**
 * Enforces per-IP hourly and global daily vision caps.
 * Defaults: VISION_PER_IP_HOURLY=10, VISION_DAILY_CAP=250.
 */
export async function checkAndIncrementVisionUsage({
	ipAddress = '127.0.0.1',
	prismaClient = prisma,
	hourlyCap = parseInt(process.env.VISION_PER_IP_HOURLY || '10', 10),
	dailyCap = parseInt(process.env.VISION_DAILY_CAP || '250', 10),
	now = new Date(),
}: {
	ipAddress?: string;
	prismaClient?: typeof prisma;
	hourlyCap?: number;
	dailyCap?: number;
	now?: Date;
} = {}): Promise<RateLimitCheckResult> {
	// Construct window keys
	const hourKey = `ip:${ipAddress}:${now.toISOString().slice(0, 13)}`; // e.g. "ip:127.0.0.1:2026-10-22T11"
	const dayKey = `global:daily:${now.toISOString().slice(0, 10)}`; // e.g. "global:daily:2026-10-22"

	// 1. Try DB-backed counter via Prisma
	try {
		// Global daily cap check
		const globalDayStart = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');
		const globalCounter = await prismaClient.usageCounter.upsert({
			where: {
				key_windowStart: {
					key: 'global:daily',
					windowStart: globalDayStart,
				},
			},
			update: { count: { increment: 1 } },
			create: { key: 'global:daily', windowStart: globalDayStart, count: 1 },
		});

		if (globalCounter.count > dailyCap) {
			return {
				allowed: false,
				reason: `Global daily vision cap of ${dailyCap} requests reached`,
				currentCount: globalCounter.count,
				maxAllowed: dailyCap,
			};
		}

		// Per-IP hourly cap check
		const ipHourStart = new Date(now.toISOString().slice(0, 13) + ':00:00.000Z');
		const ipKeyName = `ip:${ipAddress}`;
		const ipCounter = await prismaClient.usageCounter.upsert({
			where: {
				key_windowStart: {
					key: ipKeyName,
					windowStart: ipHourStart,
				},
			},
			update: { count: { increment: 1 } },
			create: { key: ipKeyName, windowStart: ipHourStart, count: 1 },
		});

		if (ipCounter.count > hourlyCap) {
			return {
				allowed: false,
				reason: `Hourly vision request cap of ${hourlyCap} reached for IP ${ipAddress}`,
				currentCount: ipCounter.count,
				maxAllowed: hourlyCap,
			};
		}

		return { allowed: true, currentCount: ipCounter.count, maxAllowed: hourlyCap };
	} catch {
		// Fallback to in-memory counter if DB is unconfigured or in tests
		const globalCount = (inMemoryCounters.get(dayKey) || 0) + 1;
		inMemoryCounters.set(dayKey, globalCount);

		if (globalCount > dailyCap) {
			return {
				allowed: false,
				reason: `Global daily vision cap of ${dailyCap} reached`,
				currentCount: globalCount,
				maxAllowed: dailyCap,
			};
		}

		const ipCount = (inMemoryCounters.get(hourKey) || 0) + 1;
		inMemoryCounters.set(hourKey, ipCount);

		if (ipCount > hourlyCap) {
			return {
				allowed: false,
				reason: `Hourly vision request cap of ${hourlyCap} reached for IP ${ipAddress}`,
				currentCount: ipCount,
				maxAllowed: hourlyCap,
			};
		}

		return { allowed: true, currentCount: ipCount, maxAllowed: hourlyCap };
	}
}
