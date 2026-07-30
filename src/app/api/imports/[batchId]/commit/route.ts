import { randomUUID } from "node:crypto";

import { ImportCommitBodySchema } from "@/lib/schemas/api";
import { fromPublicId } from "@/lib/public-ids";
import { ok, withApi } from "@/server/api/with-api";
import { batchToWire } from "@/server/api/wire";
import { mapImportError } from "@/server/api/import-errors";
import { NotFoundError } from "@/server/errors";
import { recomputeAfterChange } from "@/server/api/recompute";
import { getBatch } from "@/server/services/import-queries";
import { commitBatch } from "@/server/services/imports";

export const POST = withApi(
  { bodySchema: ImportCommitBodySchema },
  async ({ ctx, db, body, params, req }) => {
    const uuid = fromPublicId("batch", params.batchId ?? "");
    if (!uuid) throw new NotFoundError();
    const accountUuid = fromPublicId("account", body.accountId);
    if (!accountUuid) throw new NotFoundError();
    const idempotencyKey = req.headers.get("idempotency-key") ?? randomUUID();
    try {
      const result = await commitBatch(ctx, db, uuid, null, {
        accountId: accountUuid,
        idempotencyKey,
        ...(body.crossDupeDecision ? { crossDupeDecision: body.crossDupeDecision } : {}),
      });
      if (!result.alreadyCommitted && result.earliestDate) {
        await recomputeAfterChange(ctx, result.earliestDate);
      }
      return ok(batchToWire(await getBatch(ctx, db, result.batchId)));
    } catch (err) {
      throw mapImportError(err);
    }
  },
);
