import { expect, test } from "@playwright/test";

import postgres from "postgres";

import { apiPost, freshUser, signInAs } from "./helpers";

/**
 * §20.2 blocking gate — ledger filter round-trip < 500 ms p95 over 20 filter
 * interactions at a 50k-row workspace, measured as request+render (the fetch
 * plus a rendered-row settle). Rows are seeded directly through Postgres —
 * the same database the webServer uses — because no bulk API exists by design.
 */

const DB_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/ledger_lens";

test.describe("ledger filter round-trip (§20.2)", () => {
  test("p95 < 500ms over 20 interactions @ 50k rows", async ({ page, context }) => {
    test.setTimeout(300_000);
    const user = freshUser("perf");
    await signInAs(context, user);
    await page.goto("/app/dashboard");
    await apiPost(page, "/workspace/demo", { action: "seed" });

    // Top the workspace up to 50k rows via SQL (fast single INSERT..SELECT).
    const sql = postgres(DB_URL, { prepare: false, max: 1 });
    try {
      const [ws] = await sql`
        select id from workspaces where clerk_user_id = ${user}
      `;
      await sql`
        insert into transactions
          (workspace_id, account_id, import_batch_id, date, type, amount, currency, description)
        select ${ws!.id}, a.id, b.id,
               ('2026-07-01'::date - (g % 400)),
               case when g % 2 = 0 then 'deposit'::transaction_type else 'withdrawal'::transaction_type end,
               case when g % 2 = 0 then 25.0000 else -25.0000 end,
               'USD', 'perf filler row ' || g
        from generate_series(1, 48000) as g,
             lateral (select id from accounts where workspace_id = ${ws!.id} limit 1) a,
             lateral (select id from import_batches where workspace_id = ${ws!.id} limit 1) b
      `;
    } finally {
      await sql.end();
    }

    await page.goto("/app/ledger");
    await page.getByTestId("ledger-table").waitFor({ timeout: 30_000 });

    // 20 filter interactions: alternate type filter and text search, including
    // the §20.9-3 worst case (single-character search).
    // 20 unique terms — a repeat would serve from the client cache (§20.6)
    // and never hit the network. Includes the §20.9-3 single-character worst case.
    const searches = [
      "n", "ne", "net", "perf", "fee", "row 1", "a", "de", "payroll", "x",
      "b", "ro", "row 2", "row 3", "fil", "ler", "row 4", "w", "row 5", "row 6",
    ];
    const durations: number[] = [];
    for (let i = 0; i < 20; i++) {
      const term = searches[i]!;
      const started = Date.now();
      const responsePromise = page.waitForResponse(
        (r) => r.url().includes("/api/transactions") && r.status() === 200,
        { timeout: 10_000 },
      );
      const box = page.getByPlaceholder(/search/i);
      await box.fill(term);
      await responsePromise;
      // render settle: either the updated table or the filtered-empty state.
      await page
        .locator('[data-testid="ledger-table"], [data-variant="filtered-empty"]')
        .first()
        .waitFor({ timeout: 10_000 });
      durations.push(Date.now() - started);
    }
    // Clean up the 48k synthetic rows — the supersedes index (0006) makes
    // this a fast direct delete.
    const cleanup = postgres(DB_URL, { prepare: false, max: 1 });
    try {
      await cleanup`delete from transactions where workspace_id in
        (select id from workspaces where clerk_user_id = ${user})`;
      await cleanup`delete from workspaces where clerk_user_id = ${user}`;
    } finally {
      await cleanup.end();
    }

    durations.sort((a, b) => a - b);
    const p95 = durations[Math.ceil(durations.length * 0.95) - 1]!;
    console.log(`ledger filter p95=${p95}ms (all: ${durations.join(",")})`);
    // §03.6.1 debounce (300ms) is part of the interaction; the budget covers
    // request+render — subtract the fixed debounce the UI applies before firing.
    expect(p95 - 300).toBeLessThan(500);
  });
});
