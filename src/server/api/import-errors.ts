import "server-only";

import { toPublicId } from "@/lib/public-ids";
import { AppError, ConflictError, NotFoundError, PayloadError } from "@/server/errors";
import { FileRejectError } from "@/server/import/parse";
import { ImportError } from "@/server/services/imports";

/** Translate import-layer errors into the §18.2 taxonomy at the route boundary. */
export function mapImportError(err: unknown): unknown {
  if (err instanceof FileRejectError) {
    if (err.code === "file_too_large") {
      return new PayloadError("payload_too_large", err.message);
    }
    if (err.code === "file_binary") {
      return new PayloadError("unsupported_media_type", err.message);
    }
    return new AppError("validation_failed", err.message, true, {
      file: err.code,
    });
  }
  if (err instanceof ImportError) {
    switch (err.code) {
      case "duplicate_file":
        return new ConflictError("duplicate_file", err.message, {
          originalBatchId: err.meta?.originalBatchId
            ? toPublicId("batch", err.meta.originalBatchId as string)
            : undefined,
        });
      case "batch_not_found":
        return new NotFoundError();
      case "not_validated":
        return new ConflictError("not_validated", err.message);
      case "invalid_state":
        return new ConflictError("stale_state", err.message);
      case "mapping_invalid":
        return new AppError("validation_failed", err.message);
    }
  }
  return err;
}
