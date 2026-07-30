import { ok, withApi } from "@/server/api/with-api";
import { batchToWire } from "@/server/api/wire";
import { fromPublicId } from "@/lib/public-ids";
import { NotFoundError } from "@/server/errors";
import { getBatch } from "@/server/services/import-queries";

export const GET = withApi({}, async ({ ctx, db, params }) => {
  const uuid = fromPublicId("batch", params.batchId ?? "");
  if (!uuid) throw new NotFoundError();
  const batch = await getBatch(ctx, db, uuid);
  return ok(batchToWire(batch));
});
