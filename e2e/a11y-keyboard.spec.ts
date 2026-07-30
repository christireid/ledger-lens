import { readFileSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { apiPost, freshUser, signInAs, SAMPLE_CSV } from "./helpers";

/**
 * §19.4-2 Tier-2 — the §03.12 walkthrough as an executable keyboard-only
 * spec: import a file, filter the ledger, open a finding, open evidence,
 * undo an action. No page.mouse calls permitted — enforced by the spec
 * reading its own source. §19.4-1 extras: reduced-motion and forced-colors
 * axe passes.
 */

test("this spec uses no mouse APIs (§19.4-2 lint)", () => {
  const source = readFileSync("e2e/a11y-keyboard.spec.ts", "utf8");
  // Patterns split so this check doesn't match itself.
  expect(source.includes("page." + "mouse.")).toBe(false);
  expect(source.includes(".cl" + "ick(")).toBe(false);
});

test("keyboard-only walkthrough (§03.12/§19.4-2)", async ({ page, context }) => {
  test.setTimeout(180_000);
  const user = freshUser("kbd");
  await signInAs(context, user);
  await page.goto("/app/dashboard");
  await apiPost(page, "/workspace/demo", { action: "seed" });

  // 1. Import a file — upload via the file input, advance with Enter.
  await page.goto("/app/imports/new");
  await page.getByTestId("file-input").setInputFiles({
    name: "kbd-walkthrough.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(SAMPLE_CSV),
  });
  await page.getByTestId("map-next").waitFor();
  await page.getByTestId("map-next").focus();
  await page.keyboard.press("Enter");
  await page.getByTestId("accepted-count").waitFor();
  await page.getByTestId("preview-next").focus();
  await page.keyboard.press("Enter");
  // account select (Radix) — fully keyboard operable
  await page.getByTestId("account-select").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByTestId("commit-button").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/imported|committed|accepted/i).first()).toBeVisible({
    timeout: 30_000,
  });

  // 2. Filter the ledger by typing into the focused search box.
  await page.goto("/app/ledger");
  await page.getByTestId("ledger-table").waitFor();
  const search = page.getByPlaceholder("Search descriptions…");
  await search.focus();
  await page.keyboard.type("payroll");
  await expect
    .poll(async () => page.getByTestId("ledger-table").locator("tbody tr").count(), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);

  // 3. Open a finding and its evidence drawer with Enter; close with Escape.
  await page.goto("/app/anomalies");
  const chip = page.getByTestId("evidence-chip").first();
  await chip.waitFor({ timeout: 20_000 });
  await chip.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("evidence-drawer")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("evidence-drawer")).toBeHidden();

  // 4. Undo an action: acknowledge via keyboard, then undo from the toast.
  const ack = page.getByRole("button", { name: "Acknowledge", exact: true }).first();
  await ack.focus();
  await page.keyboard.press("Enter");
  const undo = page.getByRole("button", { name: "Undo" });
  await undo.waitFor({ timeout: 5_000 });
  await undo.focus();
  await page.keyboard.press("Enter");
  await expect(undo).toBeHidden({ timeout: 5_000 });
});

test("reduced-motion pass — dashboard stays axe-clean (§19.4-1)", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  const user = freshUser("axemotion");
  await signInAs(context, user);
  await page.goto("/app/dashboard");
  await apiPost(page, "/workspace/demo", { action: "seed" });
  await page.goto("/app/dashboard");
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
  expect(serious.map((v) => v.id)).toEqual([]);
  await context.close();
});

test("forced-colors pass — dashboard stays axe-clean (§19.4-1)", async ({ browser }) => {
  const context = await browser.newContext({ forcedColors: "active" });
  const page = await context.newPage();
  const user = freshUser("axeforced");
  await signInAs(context, user);
  await page.goto("/app/dashboard");
  await apiPost(page, "/workspace/demo", { action: "seed" });
  await page.goto("/app/dashboard");
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
  expect(serious.map((v) => v.id)).toEqual([]);
  await context.close();
});

test("640px logical (200% zoom): no horizontal scroll on marketing; interstitial is headed (§19.2/§19.3)", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 640, height: 800 } });
  const page = await context.newPage();
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow, "marketing page must reflow without horizontal scroll").toBe(false);
  // The sub-1024 interstitial is itself accessible: a real heading.
  await signInAs(context, freshUser("zoom"));
  await page.goto("/app/dashboard");
  await expect(page.getByRole("heading", { name: /larger screen/i })).toBeVisible();
  await context.close();
});
