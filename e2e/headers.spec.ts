import { expect, test } from "@playwright/test";

import { freshUser, signInAs } from "./helpers";

/**
 * §21.12 — headers and CSP asserted by reading response headers on / and the
 * dashboard; script-src must carry a per-request nonce + 'strict-dynamic' and
 * must NOT contain 'unsafe-inline'. The console check proves the policy is
 * livable: a CSP that blocks the app's own scripts would pass a header-only
 * assertion while breaking every page.
 */

const EXPECTED = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
};

async function assertCsp(csp: string | undefined) {
  expect(csp, "CSP header present").toBeTruthy();
  const scriptSrc = csp!.split(";").map((s) => s.trim()).find((s) => s.startsWith("script-src"));
  expect(scriptSrc).toBeTruthy();
  expect(scriptSrc).toContain("'nonce-");
  expect(scriptSrc).toContain("'strict-dynamic'");
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  expect(scriptSrc).not.toContain("'unsafe-eval'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
}

for (const route of ["/", "/app/dashboard"]) {
  test(`security headers + strict CSP on ${route}`, async ({ page, context }) => {
    await signInAs(context, freshUser("hdr"));
    const cspViolations: string[] = [];
    page.on("console", (msg) => {
      if (msg.text().includes("Content Security Policy")) cspViolations.push(msg.text());
    });

    const res = await page.goto(route);
    expect(res).not.toBeNull();
    for (const [key, value] of Object.entries(EXPECTED)) {
      expect(res!.headers()[key], key).toBe(value);
    }
    await assertCsp(res!.headers()["content-security-policy"]);

    // Nonce must differ per request (per-request generation, §21.4).
    const res2 = await page.goto(route);
    const nonce = (csp?: string) => /'nonce-([^']+)'/.exec(csp ?? "")?.[1];
    expect(nonce(res!.headers()["content-security-policy"])).not.toBe(
      nonce(res2!.headers()["content-security-policy"]),
    );

    // The app's own scripts must execute under the policy.
    await page.waitForLoadState("networkidle");
    expect(cspViolations, `CSP blocked the app's own resources on ${route}`).toEqual([]);
  });
}
