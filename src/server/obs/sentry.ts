import { env } from "@/server/env";
import { redact } from "@/server/obs/logger";

/**
 * Error tracking — §24.4. A thin DSN reporter (Sentry store API) rather than
 * the full @sentry/nextjs SDK: the SDK's client bundle would eat most of the
 * §20.3 headroom, and the SDK is inert without a DSN anyway (see DECISIONS.md).
 * The seam keeps §24.4's contract: beforeSend-style scrubbing (deny-by-default
 * allow-list), release tagging, digest/requestId tag correlation, and
 * fire-and-forget delivery (§24.8-4: SDK failures are swallowed; the log line
 * remains the source of truth).
 */

/** §24.2 field schema is the allow-list for event extras (§24.4). */
const ALLOWED_EXTRA_KEYS = new Set([
  "requestId",
  "route",
  "method",
  "status",
  "latencyMs",
  "errorCode",
  "userIdHash",
  "workspaceId",
  "event",
  "level",
]);

export type SentryEvent = {
  message: string;
  tags: Record<string, string>;
  extra: Record<string, unknown>;
  request?: { body?: unknown; cookies?: unknown; headers?: unknown };
  release?: string;
};

/**
 * beforeSend — §24.4: drops request bodies, strips cookies/headers, and
 * allow-lists extras to the §24.2 field schema (unknown keys removed).
 */
export function scrubEvent(event: SentryEvent): SentryEvent {
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(event.extra)) {
    if (ALLOWED_EXTRA_KEYS.has(k)) extra[k] = redact(v);
  }
  const { request: _request, ...rest } = event;
  return { ...rest, extra, message: event.message.slice(0, 300) };
}

function release(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "local";
  return `ledger-lens@${sha}`;
}

/**
 * Fire-and-forget capture. Tags carry the §18.5 correlation handles —
 * digest and requestId — so "Reference: {digest|requestId}" resolves to the
 * exact event. No-op without SENTRY_DSN.
 */
export function captureError(err: unknown, tags: Record<string, string> = {}): void {
  const dsn = env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "");
    const endpoint = `${url.protocol}//${url.host}/api/${projectId}/store/`;
    const event = scrubEvent({
      message: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      tags,
      extra: {},
      release: release(),
    });
    void fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${url.username}, sentry_client=ledger-lens/1.0`,
      },
      body: JSON.stringify({
        message: event.message,
        level: "error",
        tags: event.tags,
        extra: event.extra,
        release: event.release,
        platform: "node",
      }),
    }).catch(() => undefined);
  } catch {
    // §24.8-4: swallowed — never let telemetry become load-bearing.
  }
}
