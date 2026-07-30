import { ImportMappingBodySchema } from "@/lib/schemas/api";
import { fromPublicId } from "@/lib/public-ids";
import { ok, withApi } from "@/server/api/with-api";
import { batchToWire } from "@/server/api/wire";
import { mapImportError } from "@/server/api/import-errors";
import { NotFoundError } from "@/server/errors";
import { getBatch } from "@/server/services/import-queries";
import { updateMapping } from "@/server/services/imports";

export const PATCH = withApi(
  { bodySchema: ImportMappingBodySchema },
  async ({ ctx, db, body, params }) => {
    const uuid = fromPublicId("batch", params.batchId ?? "");
    if (!uuid) throw new NotFoundError();
    try {
      await updateMapping(ctx, db, uuid, body.mapping);
    } catch (err) {
      throw mapImportError(err);
    }
    return ok(batchToWire(await getBatch(ctx, db, uuid)));
  },
);
