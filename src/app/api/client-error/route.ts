import { logEvent } from "@/server/obs/logger";
import { captureError } from "@/server/obs/sentry";

/**
 * §24.4 digest correlation — the error boundaries beacon their digest here so
 * "Reference: {digest}" resolves to a Sentry event + log line. Accepts only a
 * digest string; no user payload crosses into telemetry (§24.2 PII rule).
 */
export async function POST(req: Request): Promise<Response> {
  let digest = "";
  try {
    const body = (await req.json()) as { digest?: unknown };
    if (typeof body.digest === "string") digest = body.digest.slice(0, 64);
  } catch {
    /* malformed beacon — ignored */
  }
  if (digest && /^[\w-]+$/.test(digest)) {
    logEvent({ level: "error", event: "error", errorCode: "internal_error", meta: { digest } });
    captureError(new Error(`client boundary digest ${digest}`), { digest });
  }
  return new Response(null, { status: 204 });
}
