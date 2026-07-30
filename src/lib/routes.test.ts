import { describe, expect, it } from "vitest";

import { decideRoute, isPublicRoute } from "@/lib/routes";

/**
 * Route matrix test — §10.8: every route × {anon, authed} yields exactly the
 * specified outcome (redirect, 401, 200/pass).
 */

const MATRIX: Array<{
  path: string;
  anon: "pass" | "redirect-sign-in" | "api-401";
  authed: "pass";
}> = [
  { path: "/", anon: "pass", authed: "pass" },
  { path: "/sign-in", anon: "pass", authed: "pass" },
  { path: "/sign-in/factor-one", anon: "pass", authed: "pass" },
  { path: "/sign-up", anon: "pass", authed: "pass" },
  { path: "/app/dashboard", anon: "redirect-sign-in", authed: "pass" },
  { path: "/app/ledger", anon: "redirect-sign-in", authed: "pass" },
  { path: "/app/anomalies", anon: "redirect-sign-in", authed: "pass" },
  { path: "/app/investigations", anon: "redirect-sign-in", authed: "pass" },
  { path: "/app/investigations/abc", anon: "redirect-sign-in", authed: "pass" },
  { path: "/app/alerts", anon: "redirect-sign-in", authed: "pass" },
  { path: "/app/imports", anon: "redirect-sign-in", authed: "pass" },
  { path: "/app/imports/new", anon: "redirect-sign-in", authed: "pass" },
  { path: "/app/settings", anon: "redirect-sign-in", authed: "pass" },
  { path: "/api/dashboard", anon: "api-401", authed: "pass" },
  { path: "/api/transactions", anon: "api-401", authed: "pass" },
  { path: "/api/imports", anon: "api-401", authed: "pass" },
  // Public API exceptions (§10.8: enumerated in one config object)
  { path: "/api/webhooks/clerk", anon: "pass", authed: "pass" },
  { path: "/api/cron/snapshot", anon: "pass", authed: "pass" },
  { path: "/api/health", anon: "pass", authed: "pass" },
  { path: "/api/docs", anon: "pass", authed: "pass" },
];

describe("route matrix (§10.3/§10.8)", () => {
  for (const row of MATRIX) {
    it(`${row.path}: anon → ${row.anon}, authed → pass`, () => {
      expect(decideRoute(row.path, false).kind).toBe(row.anon);
      expect(decideRoute(row.path, true).kind).toBe(row.authed);
    });
  }

  it("cron routes are public only under /api/cron/", () => {
    expect(isPublicRoute("/api/cronx")).toBe(false);
    expect(isPublicRoute("/api/cron/")).toBe(false);
    expect(isPublicRoute("/api/cron/anything")).toBe(true);
  });

  it("webhook route match is exact — no prefix bleed", () => {
    expect(isPublicRoute("/api/webhooks/clerk/extra")).toBe(false);
    expect(isPublicRoute("/api/webhooks")).toBe(false);
  });
});
