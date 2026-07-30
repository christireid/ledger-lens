import "server-only";

import { env } from "@/server/env";

/**
 * Rate limiting — §07.7. Upstash Redis sliding window keyed by userId (IP
 * pre-auth). If Redis is unreachable/unconfigured, limits FAIL OPEN with a
 * logged warning (availability over enforcement — explicit tradeoff).
 */

export type RateScope = "global" | "ai" | "import" | "bootstrap";

const LIMITS: Record<RateScope, { limit: number; windowSeconds: number }> = {
  global: { limit: 100, windowSeconds: 60 },
  ai: { limit: 10, windowSeconds: 60 }, // + 100/day enforced in the AI service
  import: { limit: 10, windowSeconds: 3600 },
  bootstrap: { limit: 5, windowSeconds: 60 },
};

export type RateResult = { allowed: true } | { allowed: false; retryAfter: number };

export async function checkRateLimit(
  scope: RateScope,
  key: string,
): Promise<RateResult> {
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = env;
  if (!url || !token) return { allowed: true }; // fail-open (§07.7)

  const { limit, windowSeconds } = LIMITS[scope];
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const redisKey = `rl:${scope}:${key}:${bucket}`;
  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["EXPIRE", redisKey, String(windowSeconds)],
      ]),
      signal: AbortSignal.timeout(500), // §07.8: 500 ms, no retry
    });
    if (!res.ok) return { allowed: true };
    const [{ result: count }] = (await res.json()) as [{ result: number }];
    if (count > limit) {
      const secondsIntoBucket = Math.floor(Date.now() / 1000) % windowSeconds;
      return { allowed: false, retryAfter: windowSeconds - secondsIntoBucket };
    }
    return { allowed: true };
  } catch {
    console.warn(`rate-limit: Upstash unreachable — failing open (scope=${scope})`);
    return { allowed: true };
  }
}
