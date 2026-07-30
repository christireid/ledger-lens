import { CursorQuerySchema } from "@/lib/schemas/api";
import { toPublicId } from "@/lib/public-ids";
import { created, ok, withApi } from "@/server/api/with-api";
import { batchToWire } from "@/server/api/wire";
import { AppError, PayloadError } from "@/server/errors";
import { listBatches } from "@/server/services/import-queries";
import { createDraftBatch } from "@/server/services/imports";
import { mapImportError } from "@/server/api/import-errors";

export const maxDuration = 60; // §15.2 parse within Vercel limits

export const GET = withApi(
  { querySchema: CursorQuerySchema },
  async ({ ctx, db, query }) => {
    const rows = await listBatches(ctx, db, query.limit);
    return ok(rows.map(batchToWire), { cursor: null });
  },
);

export const POST = withApi(
  { rawBody: true, rateScope: "import" },
  async ({ ctx, db, req }) => {
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new AppError("unsupported_media_type", "Expected multipart/form-data.");
    }
    // §21.7: Content-Length pre-check BEFORE buffering the body (the per-file
    // size check below re-verifies the actual bytes).
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > 11 * 1024 * 1024) {
      throw new PayloadError("payload_too_large", "File exceeds the 10 MB limit.");
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("validation_failed", "Missing 'file' field.");
    }
    if (file.size > 10 * 1024 * 1024) {
      // §17.5: server re-checks actual stream length
      throw new PayloadError("payload_too_large", "File exceeds the 10 MB limit.");
    }
    const content = new Uint8Array(await file.arrayBuffer());
    try {
      const result = await createDraftBatch(ctx, db, { name: file.name, content });
      return created({
        id: toPublicId("batch", result.batchId),
        headers: result.parsed.headers,
        sampleRows: result.parsed.rows.slice(0, 20),
        rowCount: result.parsed.rows.length,
        suggestedMapping: result.suggestedMapping,
        suggestions: result.suggestions,
        syntheticHeaders: result.parsed.syntheticHeaders,
      });
    } catch (err) {
      throw mapImportError(err);
    }
  },
);
