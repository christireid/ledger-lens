import { AnomaliesQuerySchema } from "@/lib/schemas/api";
import { ok, withApi } from "@/server/api/with-api";
import { anomalyToWire } from "@/server/api/wire";
import { listAnomalies } from "@/server/services/anomalies";

export const GET = withApi(
  { querySchema: AnomaliesQuerySchema },
  async ({ ctx, db, query }) => {
    const rows = await listAnomalies(ctx, db, query);
    return ok(rows.map(anomalyToWire), { cursor: null });
  },
);
