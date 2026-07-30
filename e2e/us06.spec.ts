import { expect, test } from "@playwright/test";

import { apiPost, freshUser, signInAs } from "./helpers";

/**
 * US-06 AI investigation (M8 gate) — mocked gateway (§22): answer streams,
 * every claim carries a citation chip from a real query, clicking the chip
 * opens the exact ledger rows, refusals are explicit.
 */

test.describe("US-06 AI investigation", () => {
  test("answerable question streams with citation chips whose drawer shows rows", async ({ page, context }) => {
    const user = freshUser("us06");
    await signInAs(context, user);
    await page.goto("/app/dashboard");
    await apiPost(page, "/workspace/demo", { action: "seed" });

    await page.goto("/app/investigations");
    await page.getByTestId("new-investigation").click();
    await expect(page).toHaveURL(/\/app\/investigations\/inv_/);

    await page.getByTestId("composer").fill("What were my largest fees this quarter?");
    await page.getByTestId("send-button").click();

    // Streamed answer finalizes into the thread with citation chips.
    const chip = page.getByTestId("citation-chip").first();
    await expect(chip).toBeVisible({ timeout: 20_000 });
    const message = page.locator('[data-role="assistant"]').first();
    await expect(message).toContainText(/largest totals|Fee/i);

    // Citation → evidence drawer with real ledger rows (§08.5 / §03.6.4).
    await chip.click();
    await expect(page.getByTestId("evidence-drawer")).toBeVisible();
    await expect(page.getByTestId("evidence-drawer")).toContainText(/\$|transactions/i);
    await page.keyboard.press("Escape");

    // Model/prompt provenance in the footer (§03.6.3).
    await expect(message).toContainText("mock-investigator");
  });

  test("ungroundable question refuses explicitly with zero citation chips", async ({ page, context }) => {
    const user = freshUser("us06r");
    await signInAs(context, user);
    await page.goto("/app/dashboard");
    await apiPost(page, "/workspace/demo", { action: "seed" });

    await page.goto("/app/investigations");
    await page.getByTestId("new-investigation").click();
    await expect(page).toHaveURL(/\/app\/investigations\/inv_/);
    await page.getByTestId("composer").fill("What will AAPL be worth tomorrow?");
    await page.getByTestId("send-button").click();

    const message = page.locator('[data-role="assistant"]').first();
    await expect(message).toContainText(/can't answer that from your workspace data/i, {
      timeout: 20_000,
    });
    await expect(page.getByTestId("citation-chip")).toHaveCount(0);
  });

  test("starter question from the empty state pre-sends into a new thread", async ({ page, context }) => {
    const user = freshUser("us06s");
    await signInAs(context, user);
    await page.goto("/app/dashboard");
    await apiPost(page, "/workspace/demo", { action: "seed" });

    await page.goto("/app/investigations");
    await page.getByRole("button", { name: "What were my largest fees this quarter?" }).click();
    await expect(page).toHaveURL(/\/app\/investigations\/inv_/);
    await expect(page.locator('[data-role="assistant"]').first()).toBeVisible({ timeout: 20_000 });
  });
});
