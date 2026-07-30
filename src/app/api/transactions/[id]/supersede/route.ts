import { SupersedeBodySchema } from "@/lib/schemas/api";
import { fromPublicId, toPublicId } from "@/lib/public-ids";
import { created, withApi } from "@/server/api/with-api";
import { NotFoundError } from "@/server/errors";
import { supersedeTransaction } from "@/server/services/transactions";
import { recomputeAfterChange } from "@/server/api/recompute";

export const POST = withApi(
  { bodySchema: SupersedeBodySchema },
  async ({ ctx, db, body, params }) => {
    const uuid = fromPublicId("transaction", params.id ?? "");
    if (!uuid) throw new NotFoundError();
    const { newId, earliestDate } = await supersedeTransaction(ctx, db, uuid, body.correction);
    await recomputeAfterChange(ctx, earliestDate);
    return created({ id: toPublicId("transaction", newId) });
  },
);
