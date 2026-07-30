import "server-only";

import type { MarketDate } from "@/lib/schemas";
import type { Ctx } from "@/server/context";
import { withRls } from "@/server/db/rls";
import { logEvent } from "@/server/obs/logger";
import { recomputeSnapshots } from "@/server/services/snapshots";
import { runDetectorsForWorkspace } from "@/server/services/nightly";

/**
 * §07.6: post-commit/supersede recompute — waitUntil() fire-and-forget with
 * logging; UI shows the "recomputing" freshness state until done. Detectors
 * run after snapshot recompute completes (§14.5-1 ordering).
 */
export async function recomputeAfterChange(
  ctx: Ctx,
  earliestAffectedDate: string,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10) as MarketDate;
  const job = (async () => {
    try {
      await withRls(ctx.userId, async (db) => {
        await recomputeSnapshots(db, ctx.workspaceId, {
          today,
          earliestAffectedDate: earliestAffectedDate as MarketDate,
        });
      });
      await withRls(ctx.userId, async (db) => {
        await runDetectorsForWorkspace(ctx, db, today, { includeNightlyOnly: false });
      });
    } catch (err) {
      // Documented degradation (§07.6): stale-snapshot state + nightly self-heal.
      logEvent({
        level: "error",
        event: "service",
        meta: { note: "recompute waitUntil failed", name: err instanceof Error ? err.name : typeof err },
      });
    }
  })();

  try {
    const { waitUntil } = await import("@vercel/functions");
    waitUntil(job);
  } catch {
    // Local/dev without the Vercel runtime helper: run inline.
    await job;
  }
}
