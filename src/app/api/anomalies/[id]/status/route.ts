import { AnomalyStatusBodySchema } from "@/lib/schemas/api";
import { fromPublicId } from "@/lib/public-ids";
import { ok, withApi } from "@/server/api/with-api";
import { anomalyToWire } from "@/server/api/wire";
import { NotFoundError } from "@/server/errors";
import { setAnomalyStatus } from "@/server/services/anomalies";

export const POST = withApi(
  { bodySchema: AnomalyStatusBodySchema },
  async ({ ctx, db, body, params }) => {
    const uuid = fromPublicId("anomaly", params.id ?? "");
    if (!uuid) throw new NotFoundError();
    const row = await setAnomalyStatus(ctx, db, uuid, body.status, body.note);
    return ok(anomalyToWire(row));
  },
);
