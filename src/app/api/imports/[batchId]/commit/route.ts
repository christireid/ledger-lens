import { randomUUID } from "node:crypto";

import { ImportCommitBodySchema } from "@/lib/schemas/api";
import { fromPublicId } from "@/lib/public-ids";
import { ok, withApi } from "@/server/api/with-api";
import { batchToWire } from "@/server/api/wire";
import { mapImportError } from "@/server/api/import-errors";
import { NotFoundError } from "@/server/errors";
import { recomputeAfterChange } from "@/server/api/recompute";
import { getBatch } from "@/server/services/import-queries";
import { eq } from "drizzle-orm";

import { adminDb } from "@/server/db/rls";
import { importBatches } from "@/server/db/schema";
import { commitBatch, ImportError } from "@/server/services/imports";

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
      // §15.5: a commit-time failure (FK, constraint, crash) marks the batch
      // failed. The request transaction is rolling back, so persist via the
      // admin handle; idempotent-commit and validation errors keep their state.
      const mapped = mapImportError(err);
      if (mapped instanceof Error && !(err instanceof ImportError)) {
        try {
          await adminDb()
            .update(importBatches)
            .set({ status: "failed" })
            .where(eq(importBatches.id, uuid));
        } catch {
          /* status write is best-effort */
        }
      }
      throw mapped;
    }
  },
);
