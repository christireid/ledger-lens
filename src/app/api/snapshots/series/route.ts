import type { MarketDate } from "@/lib/schemas";
import { SeriesQuerySchema } from "@/lib/schemas/api";
import { ok, withApi } from "@/server/api/with-api";
import { snapshotSeries } from "@/server/services/analytics";
import { resolveRange } from "@/server/services/dashboard";

export const GET = withApi(
  { querySchema: SeriesQuerySchema },
  async ({ ctx, db, query }) => {
    const today = new Date().toISOString().slice(0, 10) as MarketDate;
    const { from, to } = resolveRange(query.range, today);
    const series = await snapshotSeries(ctx, db, from, to);
    return ok(series);
  },
);
