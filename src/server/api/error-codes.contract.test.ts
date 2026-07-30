import { describe, expect, it } from "vitest";

import { ERROR_CODES, ERROR_STATUS } from "@/lib/schemas/error-codes";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  InvalidCursorError,
  NotFoundError,
  PayloadError,
  RateLimitError,
  UnauthorizedError,
  UpstreamError,
} from "@/server/errors";
import { serializeError } from "@/server/api/with-api";

/**
 * §18.8: every ErrorCode is exercised at least once through the serializer —
 * envelope shape, status from the §17.4 map, and header consistency
 * (Retry-After mirrors retryAfter). §16.5: the OpenAPI document's error enum
 * stays in lockstep with ERROR_CODES.
 */

const INSTANCES: Record<string, AppError> = {
  unauthorized: new UnauthorizedError(),
  forbidden: new ForbiddenError(),
  not_found: new NotFoundError(),
  duplicate_file: new ConflictError("duplicate_file", "dup"),
  duplicate_rule: new ConflictError("duplicate_rule", "dup"),
  stream_in_progress: new ConflictError("stream_in_progress", "busy"),
  not_validated: new ConflictError("not_validated", "not validated"),
  stale_state: new ConflictError("stale_state", "stale"),
  invalid_cursor: new InvalidCursorError(),
  payload_too_large: new PayloadError("payload_too_large", "too big"),
  unsupported_media_type: new PayloadError("unsupported_media_type", "bad type"),
  validation_failed: new AppError("validation_failed", "invalid"),
  rate_limited: new RateLimitError(42),
  upstream_unavailable: new UpstreamError(),
  internal_error: new AppError("internal_error", "boom"),
};

describe("ErrorCode sweep (§18.8)", () => {
  for (const code of ERROR_CODES) {
    it(`${code} → ${ERROR_STATUS[code]} envelope`, async () => {
      const instance = INSTANCES[code];
      expect(instance, `no test instance for ${code}`).toBeDefined();
      const res = serializeError(instance!, "req_sweep");
      expect(res.status).toBe(ERROR_STATUS[code]);
      const body = (await res.json()) as { error: { code: string; requestId: string; retryAfter?: number } };
      expect(body.error.code).toBe(code);
      expect(body.error.requestId).toBe("req_sweep");
      if (code === "rate_limited") {
        // Header consistency: Retry-After mirrors retryAfter (§18.8).
        expect(res.headers.get("Retry-After")).toBe("42");
        expect(body.error.retryAfter).toBe(42);
      }
    });
  }

  it("OpenAPI error enum matches ERROR_CODES (§16.5)", async () => {
    const { GET } = await import("@/app/api/docs/route");
    const res = await GET();
    const doc = JSON.stringify(await res.json());
    for (const code of ERROR_CODES) {
      expect(doc, `OpenAPI doc missing error code ${code}`).toContain(code);
    }
  });
});
