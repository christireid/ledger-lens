import { AnomalyBulkStatusSchema } from "@/lib/schemas/api";
import { fromPublicId } from "@/lib/public-ids";
import { ok, withApi } from "@/server/api/with-api";
import { bulkAcknowledge } from "@/server/services/anomalies";

export const POST = withApi(
  { bodySchema: AnomalyBulkStatusSchema },
  async ({ ctx, db, body }) => {
    const uuids = body.ids
      .map((p) => fromPublicId("anomaly", p))
      .filter((u): u is string => u !== null);
    const count = await bulkAcknowledge(ctx, db, uuids);
    return ok({ count });
  },
);
