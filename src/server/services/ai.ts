import "server-only";

import type { Ctx } from "@/server/context";
import type { RlsDb } from "@/server/db/rls";
import { ForbiddenError, UpstreamError } from "@/server/errors";

/**
 * AI investigation service — M8 owns the gateway, tool loop, SSE stream, and
 * citations (§08, §17.3). Until then the endpoint behaves as "AI unavailable"
 * (§07.8 degraded state: composer disabled with banner) — a real, honest
 * state, not a fake success.
 */
export async function streamInvestigationMessage(
  ctx: Ctx,
  _db: RlsDb,
  _investigationId: string,
  _content: string,
): Promise<Response> {
  if (!ctx.can("investigations:use")) throw new ForbiddenError();
  throw new UpstreamError(
    "The AI investigator is not available yet. (Gateway lands in milestone M8.)",
  );
}
