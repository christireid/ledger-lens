/**
 * ErrorCode — closed enum, §18.2 (normative table). Adding a code requires
 * amending §18.2, the §17.4 status map, and the OpenAPI doc in the same PR.
 * Client (ApiError mirror, §18.4) and server (AppError) both import this.
 */
export const ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "duplicate_file",
  "duplicate_rule",
  "stream_in_progress",
  "not_validated",
  "stale_state",
  "invalid_cursor",
  "payload_too_large",
  "unsupported_media_type",
  "validation_failed",
  "rate_limited",
  "upstream_unavailable",
  "internal_error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** §17.4 status code map — kept in lockstep by the enum-parity contract test. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  duplicate_file: 409,
  duplicate_rule: 409,
  stream_in_progress: 409,
  not_validated: 409,
  stale_state: 409,
  invalid_cursor: 400,
  payload_too_large: 413,
  unsupported_media_type: 415,
  validation_failed: 422,
  rate_limited: 429,
  upstream_unavailable: 503,
  internal_error: 500,
};
