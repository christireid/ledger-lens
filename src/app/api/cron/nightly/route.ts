import type { MarketDate } from "@/lib/schemas";
import { serializeError } from "@/server/api/with-api";
import { env } from "@/server/env";
import { runNightly } from "@/server/services/nightly";

// §07.6: Vercel Cron → CRON_SECRET header auth; 202 + summary. No session auth.
export const maxDuration = 300;

export async function GET(req: Request): Promise<Response> {
  const requestId = "cron";
  try {
    const provided =
      req.headers.get("authorization")?.replace("Bearer ", "") ??
      req.headers.get("x-cron-secret");
    if (!env.CRON_SECRET || provided !== env.CRON_SECRET) {
      return Response.json(
        { error: { code: "unauthorized", message: "Missing or invalid cron secret.", requestId } },
        { status: 401 },
      );
    }
    const today = new Date().toISOString().slice(0, 10) as MarketDate;
    const summary = await runNightly(today);
    return Response.json({ data: { status: "accepted", ...summary } }, { status: 202 });
  } catch (err) {
    return serializeError(err, requestId);
  }
}
