import type { MarketDate } from "@/lib/schemas";
import { DashboardQuerySchema } from "@/lib/schemas/api";
import { toPublicId } from "@/lib/public-ids";
import { ok, withApi } from "@/server/api/with-api";
import { getDashboard } from "@/server/services/dashboard";

export const GET = withApi(
  { querySchema: DashboardQuerySchema },
  async ({ ctx, db, query }) => {
    const today = new Date().toISOString().slice(0, 10) as MarketDate;
    const raw = await getDashboard(ctx, db, query.range, today);
    // §17.1: public IDs are minted at the serialization layer.
    const data = {
      ...raw,
      recentImports: raw.recentImports.map((b) => ({ ...b, id: toPublicId("batch", b.id) })),
    };
    // §17.2: 60 s CDN-private cache
    const res = ok(data);
    res.headers.set("Cache-Control", "private, max-age=60");
    return res;
  },
);
