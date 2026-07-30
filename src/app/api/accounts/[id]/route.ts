import { AccountPatchSchema } from "@/lib/schemas/api";
import { fromPublicId } from "@/lib/public-ids";
import { ok, withApi } from "@/server/api/with-api";
import { accountToWire } from "@/server/api/wire";
import { NotFoundError } from "@/server/errors";
import { patchAccount } from "@/server/services/accounts";

export const PATCH = withApi(
  { bodySchema: AccountPatchSchema },
  async ({ ctx, db, body, params }) => {
    const uuid = fromPublicId("account", params.id ?? "");
    if (!uuid) throw new NotFoundError();
    const row = await patchAccount(ctx, db, uuid, body);
    return ok(accountToWire(row));
  },
);
