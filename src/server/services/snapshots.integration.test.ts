import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  WorkspaceIdSchema,
  type MarketDate,
  type WorkspaceId,
} from "@/lib/schemas";
import { buildCtx } from "@/server/context";
import {
  accounts,
  importBatches,
  portfolioSnapshots,
  transactions,
  workspaces,
} from "@/server/db/schema";
import { adminDb, withRls } from "@/server/db/rls";
import {
  periodAggregates,
  realizedPnlForPeriod,
  snapshotSeries,
  valueChangeForPeriod,
} from "@/server/services/analytics";
import { recomputeSnapshots } from "@/server/services/snapshots";

/**
 * §12.8 concurrent recompute test + §13.5 metric parity test, against the
 * golden fixture ledger (buy 10@100 then sell 5@120 — hand-verifiable).
 */

const userId = `engine_user_${randomUUID().slice(0, 8)}`;
let workspaceId: WorkspaceId;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("integration tests require DATABASE_URL (§23.4)");
  }
  const db = adminDb();
  const [ws] = await db
    .insert(workspaces)
    .values({ clerkUserId: userId, name: "Engine" })
    .returning();
  workspaceId = WorkspaceIdSchema.parse(ws!.id);
  const [account] = await db
    .insert(accounts)
    .values({ workspaceId: ws!.id, name: "Brokerage", type: "brokerage", currency: "USD" })
    .returning();
  const [batch] = await db
    .insert(importBatches)
    .values({ workspaceId: ws!.id, contentHash: randomUUID().replace(/-/g, "") })
    .returning();

  const { instruments } = await import("@/server/db/schema");
  const [aapl] = await db
    .insert(instruments)
    .values({ symbol: `TST${randomUUID().slice(0, 6)}`, kind: "equity", currency: "USD" })
    .returning();

  await db.insert(transactions).values([
    {
      workspaceId: ws!.id,
      accountId: account!.id,
      importBatchId: batch!.id,
      date: "2026-01-02",
      type: "deposit",
      amount: "10000.0000",
      currency: "USD",
    },
    {
      workspaceId: ws!.id,
      accountId: account!.id,
      importBatchId: batch!.id,
      date: "2026-01-05",
      type: "buy",
      amount: "-1000.0000",
      currency: "USD",
      instrumentId: aapl!.id,
      quantity: "10.00000000",
      price: "100.0000",
    },
    {
      workspaceId: ws!.id,
      accountId: account!.id,
      importBatchId: batch!.id,
      date: "2026-02-10",
      type: "sell",
      amount: "600.0000",
      currency: "USD",
      instrumentId: aapl!.id,
      quantity: "5.00000000",
      price: "120.0000",
    },
    {
      workspaceId: ws!.id,
      accountId: account!.id,
      importBatchId: batch!.id,
      date: "2026-02-15",
      type: "dividend",
      amount: "25.5000",
      currency: "USD",
      instrumentId: aapl!.id,
    },
    {
      workspaceId: ws!.id,
      accountId: account!.id,
      importBatchId: batch!.id,
      date: "2026-02-20",
      type: "fee",
      amount: "-9.9900",
      currency: "USD",
    },
  ]);
});

afterAll(async () => {
  await adminDb().delete(workspaces).where(eq(workspaces.clerkUserId, userId));
});

describe("snapshot orchestration (§12.5)", () => {
  it("backfills daily snapshots from the earliest affected date", async () => {
    const result = await withRls(userId, (db) =>
      recomputeSnapshots(db, workspaceId, {
        today: "2026-03-01" as MarketDate,
        earliestAffectedDate: "2026-01-02" as MarketDate,
      }),
    );
    expect(result.written).toBe(59); // Jan 2 .. Mar 1 inclusive
    expect(result.partialBackfill).toBe(false);

    const rows = await adminDb()
      .select()
      .from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.workspaceId, workspaceId));
    expect(rows).toHaveLength(59);
    const latest = rows.find((r) => r.asOf === "2026-03-01")!;
    // cash 10000 −1000 +600 +25.50 −9.99 = 9615.51; positions 5×120 = 600
    expect(latest.totalValue).toBe("10215.5100");
    expect(latest.cashValue).toBe("9615.5100");
    expect(latest.realizedPnlCum).toBe("100.0000");
    expect(latest.inputMaxTxCreatedAt).not.toBeNull();
  });

  it("two concurrent recomputes serialize on the advisory lock (§12.8)", async () => {
    const [a, b] = await Promise.all([
      withRls(userId, (db) =>
        recomputeSnapshots(db, workspaceId, { today: "2026-03-01" as MarketDate }),
      ),
      withRls(userId, (db) =>
        recomputeSnapshots(db, workspaceId, { today: "2026-03-01" as MarketDate }),
      ),
    ]);
    expect(a.written).toBe(1);
    expect(b.written).toBe(1);
    const rows = await adminDb()
      .select()
      .from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.workspaceId, workspaceId));
    expect(rows.filter((r) => r.asOf === "2026-03-01")).toHaveLength(1);
  });

  it("marks partial_backfill when the 366-day bound is hit (§12.7-5)", async () => {
    const result = await withRls(userId, (db) =>
      recomputeSnapshots(db, workspaceId, {
        today: "2027-06-01" as MarketDate,
        earliestAffectedDate: "2026-01-02" as MarketDate,
      }),
    );
    expect(result.partialBackfill).toBe(true);
    expect(result.written).toBe(366);
    const rows = await adminDb()
      .select()
      .from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.workspaceId, workspaceId));
    const flagged = rows.find((r) => r.asOf === "2027-06-01")!;
    expect(flagged.flags).toContain("partial_backfill");
  });
});

describe("metric parity (§13.5)", () => {
  function ctxFor(db: unknown) {
    return buildCtx({ userId, workspaceId, db });
  }

  it("period aggregates match hand-computed §13.2 definitions", async () => {
    const aggregates = await withRls(userId, (db) =>
      periodAggregates(ctxFor(db), db, "2026-01-01" as MarketDate, "2026-12-31" as MarketDate),
    );
    const usd = aggregates.find((a) => a.currency.trim() === "USD")!;
    expect(usd.income).toBe("25.5000");
    expect(usd.fees).toBe("9.9900");
    expect(usd.netContribution).toBe("10000.0000");
  });

  it("realized P&L via snapshot-cum subtraction equals the engine's replay figure", async () => {
    const realized = await withRls(userId, (db) =>
      realizedPnlForPeriod(ctxFor(db), db, "2026-01-01" as MarketDate, "2026-03-01" as MarketDate),
    );
    expect(realized).toBe("100.0000"); // 5 × (120 − 100)
  });

  it("flow-adjusted value change excludes contributions (§13.2)", async () => {
    const change = await withRls(userId, (db) =>
      valueChangeForPeriod(ctxFor(db), db, "2026-01-01" as MarketDate, "2026-03-01" as MarketDate),
    );
    // end 10215.51 − start 0 − contributions 10000 = 215.51 (dividend + realized gain − fee + unrealized)
    expect(change!.change).toBe("215.5100");
  });

  it("series reads snapshots only, ordered, no interpolation", async () => {
    const series = await withRls(userId, (db) =>
      snapshotSeries(ctxFor(db), db, "2026-01-01" as MarketDate, "2026-03-01" as MarketDate),
    );
    expect(series.length).toBe(59);
    expect(series[0]!.asOf).toBe("2026-01-02");
    expect(series.at(-1)!.asOf).toBe("2026-03-01");
    expect(series.every((p) => p.interpolated === false)).toBe(true);
  });
});
