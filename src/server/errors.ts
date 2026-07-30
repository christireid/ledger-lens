import "server-only";

import { ERROR_STATUS, type ErrorCode } from "@/lib/schemas/error-codes";

/**
 * AppError hierarchy — §18.2. Services and gateways throw subclasses; withApi
 * is the only serialization point. expose:false → generic message only.
 */
export class AppError extends Error {
  public readonly httpStatus: number;
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly expose: boolean = true,
    public readonly fields?: Record<string, string>,
    public readonly retryAfter?: number,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.httpStatus = ERROR_STATUS[code];
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required.") {
    super("unauthorized", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super("forbidden", message);
  }
}

export class NotFoundError extends AppError {
  // §10.6 anti-oracle: cross-tenant access is indistinguishable from not-found.
  constructor(message = "Not found.") {
    super("not_found", message);
  }
}

export class ConflictError extends AppError {
  constructor(
    code: Extract<
      ErrorCode,
      "duplicate_file" | "duplicate_rule" | "stream_in_progress" | "not_validated" | "stale_state"
    >,
    message: string,
    meta?: Record<string, unknown>,
  ) {
    super(code, message, true, undefined, undefined, meta);
  }
}

export class ValidationError extends AppError {
  constructor(fields: Record<string, string>, message = "Validation failed.") {
    super("validation_failed", message, true, fields);
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter: number) {
    super("rate_limited", "Too many requests.", true, undefined, retryAfter);
  }
}

export class PayloadError extends AppError {
  constructor(
    code: Extract<ErrorCode, "payload_too_large" | "unsupported_media_type">,
    message: string,
  ) {
    super(code, message);
  }
}

export class UpstreamError extends AppError {
  constructor(message = "An upstream service is unavailable. Try again shortly.") {
    super("upstream_unavailable", message);
  }
}

export class InvalidCursorError extends AppError {
  constructor() {
    super("invalid_cursor", "The pagination cursor is no longer valid.");
  }
}
