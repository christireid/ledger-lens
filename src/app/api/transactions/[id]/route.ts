import { fromPublicId } from "@/lib/public-ids";
import { ok, withApi } from "@/server/api/with-api";
import { NotFoundError } from "@/server/errors";
import { getTransaction } from "@/server/services/transactions";
import { txToWire } from "@/server/api/wire";
import { toPublicId } from "@/lib/public-ids";

export const GET = withApi({}, async ({ ctx, db, params }) => {
  const uuid = fromPublicId("transaction", params.id ?? "");
  if (!uuid) throw new NotFoundError();
  const row = await getTransaction(ctx, db, uuid);
  return ok({
    ...txToWire(row.tx, row.symbol),
    supersededById: row.supersededById
      ? toPublicId("transaction", row.supersededById)
      : null,
  });
});
