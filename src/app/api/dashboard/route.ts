import type { MarketDate } from "@/lib/schemas";
import { DashboardQuerySchema } from "@/lib/schemas/api";
import { ok, withApi } from "@/server/api/with-api";
import { getDashboard } from "@/server/services/dashboard";

export const GET = withApi(
  { querySchema: DashboardQuerySchema },
  async ({ ctx, db, query }) => {
    const today = new Date().toISOString().slice(0, 10) as MarketDate;
    const data = await getDashboard(ctx, db, query.range, today);
    // §17.2: 60 s CDN-private cache
    const res = ok(data);
    res.headers.set("Cache-Control", "private, max-age=60");
    return res;
  },
);
