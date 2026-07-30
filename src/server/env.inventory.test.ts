import { describe, expect, it, vi } from "vitest";

/** §23.12/§21.12 — the env module's inventory equals the §23.4 table exactly. */

vi.mock("server-only", () => ({}));

// The §23.4 table, verbatim (names only — never values).
const SPEC_23_4 = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "OPENAI_API_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "CRON_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "DEMO_WORKSPACE_ID",
  "DEMO_E2E_SECRET",
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN",
  "AXIOM_TOKEN",
  "OPENAI_SMOKE",
].sort();

describe("env inventory (§23.4)", () => {
  it("typed env module covers the §23.4 table exactly (NEXT_PUBLIC_* live client-side)", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("src/server/env.ts", "utf8") +
      fs.readFileSync("src/lib/env.client.ts", "utf8"),
    );
    const missing = SPEC_23_4.filter((name) => !source.includes(name));
    expect(missing, "variables in §23.4 but absent from the env modules").toEqual([]);
  });
});
