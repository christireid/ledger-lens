import { z } from "zod";

import { fromPublicId } from "@/lib/public-ids";
import { ok, withApi } from "@/server/api/with-api";
import { accountToWire } from "@/server/api/wire";
import { NotFoundError } from "@/server/errors";
import { archiveAccount } from "@/server/services/accounts";

const BodySchema = z.object({ unarchive: z.boolean().optional() });

export const POST = withApi({ rawBody: true }, async ({ ctx, db, params, req }) => {
  const uuid = fromPublicId("account", params.id ?? "");
  if (!uuid) throw new NotFoundError();
  // Optional JSON body { unarchive: true } — archive is reversible (§02.8-8).
  let unarchive = false;
  try {
    const parsed = BodySchema.parse(await req.json());
    unarchive = parsed.unarchive ?? false;
  } catch {
    /* empty body = archive */
  }
  const row = await archiveAccount(ctx, db, uuid, { unarchive });
  return ok(accountToWire(row));
});
