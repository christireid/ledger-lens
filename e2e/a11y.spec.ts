import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { apiPost, freshUser, signInAs } from "./helpers";

/**
 * M9 gate — §19/§27.4: axe per screen with populated states; zero serious or
 * critical violations. Findings summary is written to test-results for the
 * §25.4 evidence pack.
 */

const summaries: Array<{ route: string; violations: number; serious: number }> = [];

async function auditPage(page: Page, route: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrCritical = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  summaries.push({
    route,
    violations: results.violations.length,
    serious: seriousOrCritical.length,
  });
  expect(
    seriousOrCritical.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`),
    `serious/critical axe violations on ${route}`,
  ).toEqual([]);
}

test.describe("axe audits (§19)", () => {
  test("marketing page", async ({ page }) => {
    await page.goto("/");
    await auditPage(page, "/");
  });

  test("app screens, populated demo state", async ({ page, context }) => {
    test.setTimeout(180_000);
    const user = freshUser("axe");
    await signInAs(context, user);
    await page.goto("/app/dashboard");
    await apiPost(page, "/workspace/demo", { action: "seed" });

    for (const route of [
      "/app/dashboard",
      "/app/ledger",
      "/app/anomalies",
      "/app/investigations",
      "/app/alerts",
      "/app/imports",
      "/app/imports/new",
      "/app/settings",
    ]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await auditPage(page, route);
    }
  });

  test("kitchen sink (every component state, §04.13)", async ({ page }) => {
    await page.goto("/dev/kitchen-sink");
    await auditPage(page, "/dev/kitchen-sink");
  });

  test.afterAll(async () => {
    const fs = await import("node:fs");
    fs.mkdirSync("test-results", { recursive: true });
    fs.writeFileSync(
      "test-results/axe-summary.json",
      JSON.stringify({ generatedFor: "§25.4 evidence pack", summaries }, null, 2),
    );
  });
});
