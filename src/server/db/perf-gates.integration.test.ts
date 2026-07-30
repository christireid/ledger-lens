import { randomUUID } from "node:crypto";

import { eq, sql as rawSql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WorkspaceIdSchema, type MarketDate, type WorkspaceId } from "@/lib/schemas";
import { workspaces } from "@/server/db/schema";
import { adminDb, withRls } from "@/server/db/rls";
import { recomputeSnapshots } from "@/server/services/snapshots";
import { resolveWorkspace } from "@/server/services/workspace";

/**
 * §20.2 blocking gates that need a real database:
 *  - statement timeout: the app role's 5 s ceiling actually fires;
 *  - snapshot recompute: < 20 s at a 50k-row workspace (366-day backfill).
 */

const userId = `perf_${randomUUID().slice(0, 8)}`;
let workspaceId: WorkspaceId;

beforeAll(async () => {
  const resolved = await withRls(userId, (db) => resolveWorkspace(db, userId));
  workspaceId = WorkspaceIdSchema.parse(resolved.workspaceId);
}, 60_000);

afterAll(async () => {
  // Bulk-delete the 50k synthetic rows directly — the FK cascade walks them
  // row-by-row and blows the hook budget otherwise.
  const db = adminDb();
  await db.execute(rawSql`delete from transactions where workspace_id = ${workspaceId}`);
  await db.execute(rawSql`delete from portfolio_snapshots where workspace_id = ${workspaceId}`);
  await db.delete(workspaces).where(eq(workspaces.clerkUserId, userId));
}, 120_000);

describe("statement timeout (§09.5/§20.2)", () => {
  it("app_user queries are killed at 5s — pg_sleep(6) fails", async () => {
    await expect(
      withRls(userId, async (db) => {
        await db.execute(rawSql`select pg_sleep(6)`);
      }),
    ).rejects.toThrow();
  }, 15_000);
});

describe("snapshot recompute at 50k rows (§20.2/§12.8)", () => {
  it("completes in under 20s including the 366-day backfill", async () => {
    const db = adminDb();
    // One synthetic account + batch, then 50k rows in a single INSERT..SELECT:
    // ~137 buys/sells+fees per day across 366 days, deterministic amounts.
    const [account] = (await db.execute(rawSql`
      insert into accounts (workspace_id, name, type, currency)
      values (${workspaceId}, 'perf-50k', 'brokerage', 'USD') returning id
    `)) as unknown as Array<{ id: string }>;
    const [batch] = (await db.execute(rawSql`
      insert into import_batches (workspace_id, file_name, content_hash, status, mapping, raw_content)
      values (${workspaceId}, 'perf-50k.csv', ${randomUUID()}, 'committed', '{}', '')
      returning id
    `)) as unknown as Array<{ id: string }>;
    const [instrument] = (await db.execute(rawSql`
      insert into instruments (symbol, kind, currency, name)
      values (${"PRF" + randomUUID().slice(0, 5).toUpperCase()}, 'equity', 'USD', 'Perf Instrument')
      returning id
    `)) as unknown as Array<{ id: string }>;

    await db.execute(rawSql`
      insert into transactions
        (workspace_id, account_id, import_batch_id, date, type, amount, currency,
         instrument_id, quantity, price, description)
      select
        ${workspaceId}, ${account!.id}::uuid, ${batch!.id}::uuid,
        ('2026-07-29'::date - ((g / 137) % 366)),
        case when g % 3 = 0 then 'buy'::transaction_type
             when g % 3 = 1 then 'sell'::transaction_type
             else 'fee'::transaction_type end,
        case when g % 3 = 0 then -100.0000 when g % 3 = 1 then 60.0000 else -1.2500 end,
        'USD',
        case when g % 3 < 2 then ${instrument!.id}::uuid else null end,
        case when g % 3 = 0 then 1.00000000 when g % 3 = 1 then 0.50000000 else null end,
        case when g % 3 = 0 then 100.0000 when g % 3 = 1 then 120.0000 else null end,
        'perf row ' || g
      from generate_series(1, 50000) as g
    `);

    const started = Date.now();
    const result = await withRls(userId, (db2) =>
      recomputeSnapshots(db2, workspaceId, {
        today: "2026-07-29" as MarketDate,
        earliestAffectedDate: "2025-07-29" as MarketDate,
      }),
    );
    const elapsedMs = Date.now() - started;
    expect(result.written).toBeGreaterThan(300);
    expect(elapsedMs).toBeLessThan(20_000);
  }, 120_000);
});
