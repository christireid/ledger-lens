import { afterEach, describe, expect, it } from "vitest";

import { _setSinkForTest, hashUserId, logEvent, redact } from "@/server/obs/logger";
import { scrubEvent } from "@/server/obs/sentry";

/** §24.10 — synthetic PII through the logger and the Sentry beforeSend. */

const PII = {
  description: "NETFLIX.COM 866-579-7172",
  counterparty: "Jane Doe",
  amount: "1234.56",
  filename: "chase-export-2026.csv",
  prompt: "why did my NFLX position drop?",
  nested: { completion: "Because you sold 10 shares", safeCount: 3 },
};

describe("structured logger (§24.2)", () => {
  afterEach(() => _setSinkForTest(null));

  it("redacts configured key paths at any depth", () => {
    const out = redact(PII) as Record<string, unknown>;
    expect(out.description).toBe("[redacted]");
    expect(out.counterparty).toBe("[redacted]");
    expect(out.amount).toBe("[redacted]");
    expect(out.filename).toBe("[redacted]");
    expect(out.prompt).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).completion).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).safeCount).toBe(3);
  });

  it("emits one JSON line with redacted meta and schema fields", () => {
    const lines: string[] = [];
    _setSinkForTest((l) => lines.push(l));
    logEvent({
      level: "warn",
      event: "import_result",
      requestId: "abc12345",
      workspaceId: "ws_x",
      meta: PII,
    });
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed.event).toBe("import_result");
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.stringify(parsed)).not.toContain("NETFLIX");
    expect(JSON.stringify(parsed)).not.toContain("Jane Doe");
  });

  it("hashUserId is stable, truncated, non-reversible-shaped", () => {
    expect(hashUserId("user_123")).toBe(hashUserId("user_123"));
    expect(hashUserId("user_123")).toMatch(/^[0-9a-f]{12}$/);
    expect(hashUserId("user_123")).not.toContain("user");
  });
});

describe("Sentry beforeSend scrub (§24.4)", () => {
  it("drops request payloads and deny-by-default filters extras", () => {
    const scrubbed = scrubEvent({
      message: "TypeError: cannot read description 'NETFLIX.COM'",
      tags: { requestId: "abc12345" },
      extra: {
        requestId: "abc12345",
        errorCode: "internal_error",
        rowPayload: PII, // unknown key — must be removed
      },
      request: { body: PII, cookies: "session=secret", headers: { auth: "x" } },
    });
    expect(scrubbed.request).toBeUndefined();
    expect(scrubbed.extra.rowPayload).toBeUndefined();
    expect(scrubbed.extra.requestId).toBe("abc12345");
    expect(scrubbed.extra.errorCode).toBe("internal_error");
    expect(scrubbed.tags.requestId).toBe("abc12345");
  });
});
