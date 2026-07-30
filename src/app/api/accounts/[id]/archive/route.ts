import { fromPublicId } from "@/lib/public-ids";
import { ok, withApi } from "@/server/api/with-api";
import { accountToWire } from "@/server/api/wire";
import { NotFoundError } from "@/server/errors";
import { archiveAccount } from "@/server/services/accounts";

export const POST = withApi({}, async ({ ctx, db, params }) => {
  const uuid = fromPublicId("account", params.id ?? "");
  if (!uuid) throw new NotFoundError();
  const row = await archiveAccount(ctx, db, uuid);
  return ok(accountToWire(row));
});
