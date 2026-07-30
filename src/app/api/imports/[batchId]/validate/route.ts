import { fromPublicId } from "@/lib/public-ids";
import { ok, withApi } from "@/server/api/with-api";
import { mapImportError } from "@/server/api/import-errors";
import { NotFoundError } from "@/server/errors";
import { dryRunBatch } from "@/server/services/imports";

export const maxDuration = 60; // §17.2

export const POST = withApi({}, async ({ ctx, db, params }) => {
  const uuid = fromPublicId("batch", params.batchId ?? "");
  if (!uuid) throw new NotFoundError();
  try {
    const result = await dryRunBatch(ctx, db, uuid);
    return ok({
      accepted: result.accepted.length,
      rejected: result.rejected.map(({ line, field, code, message }) => ({ line, field, code, message })),
      intraFileDuplicates: result.intraFileDuplicates,
      crossBatchDupes: result.crossBatchDupes.length,
      typeTally: result.typeTally,
      euLocaleColumns: result.euLocaleColumns,
    });
  } catch (err) {
    throw mapImportError(err);
  }
});
