import { sql as rawSql } from "drizzle-orm";

import { adminDb } from "@/server/db/rls";
import { checkRateLimit } from "@/server/api/rate-limit";
import { env } from "@/server/env";

// §24.6 health endpoint — public, no session; SELECT 1 with a 1 s timeout,
// lightly rate-limited by IP, no version/schema/dependency detail exposed.
export async function GET(req: Request): Promise<Response> {
  const ip = req.headers.get("x-forwarded-for") ?? "anon";
  const rate = await checkRateLimit("global", `health:${ip}`);
  if (!rate.allowed) {
    return Response.json(
      { error: { code: "rate_limited", message: "Slow down.", requestId: "health" } },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }
  let dbOk = false;
  if (env.DATABASE_URL) {
    try {
      await Promise.race([
        adminDb().execute(rawSql`select 1`),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 1_000)),
      ]);
      dbOk = true;
    } catch {
      dbOk = false;
    }
  }
  if (!dbOk) {
    // §24.6: unhealthy returns the standard §17.1 error envelope.
    return Response.json(
      { error: { code: "upstream_unavailable", message: "Service degraded.", requestId: "health" } },
      { status: 503 },
    );
  }
  return Response.json({ data: { status: "ok", db: "ok" } }, { status: 200 });
}
