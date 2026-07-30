import { sql as rawSql } from "drizzle-orm";

import { adminDb } from "@/server/db/rls";
import { env } from "@/server/env";

// §24 health endpoint — public, no session; DB round-trip + config posture.
export async function GET(): Promise<Response> {
  const checks: Record<string, "ok" | "unavailable" | "unconfigured"> = {};
  if (env.DATABASE_URL) {
    try {
      await adminDb().execute(rawSql`select 1`);
      checks.database = "ok";
    } catch {
      checks.database = "unavailable";
    }
  } else {
    checks.database = "unconfigured";
  }
  checks.ai = env.OPENAI_API_KEY && env.OPENAI_API_KEY !== "MOCK" ? "ok" : "unconfigured";
  const healthy = checks.database === "ok";
  return Response.json(
    { data: { status: healthy ? "healthy" : "degraded", checks } },
    { status: healthy ? 200 : 503 },
  );
}
