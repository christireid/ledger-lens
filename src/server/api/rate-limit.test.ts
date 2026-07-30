import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** §22.5 — the fail-open path is unit-tested with a mocked, unreachable Redis. */

vi.mock("server-only", () => ({}));
vi.mock("@/server/env", () => ({
  env: {
    UPSTASH_REDIS_REST_URL: "https://unreachable.upstash.example",
    UPSTASH_REDIS_REST_TOKEN: "tok",
  },
}));

import { _setSinkForTest } from "@/server/obs/logger";
import { checkRateLimit } from "@/server/api/rate-limit";

describe("rate-limit fail-open (§21.6)", () => {
  const lines: string[] = [];
  beforeEach(() => {
    lines.length = 0;
    _setSinkForTest((l) => lines.push(l));
  });
  afterEach(() => {
    _setSinkForTest(null);
    vi.restoreAllMocks();
  });

  it("Redis unreachable → allowed:true with a ratelimit_failopen event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await checkRateLimit("ai", "u:user_1");
    expect(result).toEqual({ allowed: true });
    const events = lines.map((l) => JSON.parse(l) as { event: string });
    expect(events.some((e) => e.event === "ratelimit_failopen")).toBe(true);
    vi.unstubAllGlobals();
  });

  it("over the limit → denied with retryAfter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ result: 999 }, { result: 1 }]), { status: 200 }),
      ),
    );
    const result = await checkRateLimit("ai", "u:user_1");
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.retryAfter).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });
});
