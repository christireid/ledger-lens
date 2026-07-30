import { timingSafeEqual } from "node:crypto";

import type { MarketDate } from "@/lib/schemas";
import { serializeError } from "@/server/api/with-api";
import { env } from "@/server/env";
import { runNightly } from "@/server/services/nightly";

function timingSafeSecretMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Length mismatch short-circuits to the same 404 as a wrong secret (§21.9-2).
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// §07.6: Vercel Cron → CRON_SECRET header auth; 202 + summary. No session auth.
export const maxDuration = 300;

export async function GET(req: Request): Promise<Response> {
  const requestId = "cron";
  try {
    const provided =
      req.headers.get("authorization")?.replace("Bearer ", "") ??
      req.headers.get("x-cron-secret");
    // §21.9-2: timing-safe compare; any mismatch (including length) returns the
    // same 404 an unknown route would — anti-oracle consistency (§10.6).
    if (!env.CRON_SECRET || !provided || !timingSafeSecretMatch(provided, env.CRON_SECRET)) {
      return Response.json(
        { error: { code: "not_found", message: "Not found.", requestId } },
        { status: 404 },
      );
    }
    const today = new Date().toISOString().slice(0, 10) as MarketDate;
    const summary = await runNightly(today);
    return Response.json({ data: { status: "accepted", ...summary } }, { status: 202 });
  } catch (err) {
    return serializeError(err, requestId);
  }
}
