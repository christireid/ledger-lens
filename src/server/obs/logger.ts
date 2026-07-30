import { createHash } from "node:crypto";

/**
 * Structured logging — §24.2. One JSON object per line to stdout; the logger
 * is destination-agnostic (§24.3). A final redaction pass over configured key
 * paths backstops the PII rule (§24.2/§21.3): transaction descriptions,
 * amounts, counterparties, file contents/names, and AI prompt/completion text
 * never appear in any log field.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Closed event vocabulary (§24.2) — extend here, never inline. */
export type LogEvent =
  | "request"
  | "cron_run"
  | "import_result"
  | "ratelimit_failopen"
  | "rls_zero_rows"
  | "ai_stream"
  | "service"
  | "error";

export type LogFields = {
  level: LogLevel;
  event: LogEvent;
  requestId?: string;
  route?: string;
  method?: string;
  status?: number;
  latencyMs?: number;
  errorCode?: string;
  userIdHash?: string;
  workspaceId?: string;
  meta?: Record<string, unknown>;
};

/** §24.2 — correlatable, not reversible. */
export function hashUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

const REDACTED_KEYS = new Set([
  "description",
  "counterparty",
  "amount",
  "filename",
  "filenames",
  "file",
  "prompt",
  "completion",
  "content",
  "text",
  "message",
  "email",
  "name",
  "raw",
]);

/** Deep redaction pass — §24.2 backstop. Returns a copy; never mutates. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACTED_KEYS.has(k.toLowerCase()) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

let sink: (line: string) => void = (line) => console.log(line);

/** Test seam — capture emitted lines without touching stdout. */
export function _setSinkForTest(fn: ((line: string) => void) | null): void {
  sink = fn ?? ((line) => console.log(line));
}

export function logEvent(fields: LogFields): void {
  if (fields.level === "debug" && process.env.NODE_ENV === "production") return;
  const { meta, ...rest } = fields;
  const line = {
    ts: new Date().toISOString(),
    ...rest,
    ...(meta !== undefined ? { meta: redact(meta) } : {}),
  };
  sink(JSON.stringify(line));
}
