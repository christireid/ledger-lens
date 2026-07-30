import { randomUUID } from "node:crypto";

import { eq, sql as rawSql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WorkspaceIdSchema, type MarketDate, type WorkspaceId } from "@/lib/schemas";
import { buildCtx, type Ctx } from "@/server/context";
import { anomalies, notifications, workspaces } from "@/server/db/schema";
import { adminDb, withRls } from "@/server/db/rls";
import { previewAlertRule } from "@/server/services/alerts";
import { runDetectorsForWorkspace } from "@/server/services/nightly";
import { demoAction } from "@/server/services/workspace-admin";
import { resolveWorkspace } from "@/server/services/workspace";

/**
 * M7 gate — §27.4/§14.6: all §15.7 planted demo findings fire; dedup proven by
 * double-run (zero new rows); preview parity with the shared engine path.
 */

const userId = `detect_${randomUUID().slice(0, 8)}`;
let workspaceId: WorkspaceId;
const TODAY = "2026-07-01" as MarketDate; // demo seed date — planted findings are anchored to it

function ctxFor(db: unknown): Ctx {
  return buildCtx({ userId, workspaceId, db });
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error("integration tests require DATABASE_URL");
  const resolved = await withRls(userId, (db) => resolveWorkspace(db, userId));
  workspaceId = WorkspaceIdSchema.parse(resolved.workspaceId);
  // Seed the demo dataset (includes snapshot recompute + nightly-mode detectors).
  await withRls(userId, (db) => demoAction(ctxFor(db), db, "seed"));
}, 120_000);

afterAll(async () => {
  await adminDb().delete(workspaces).where(eq(workspaces.clerkUserId, userId));
}, 60_000);

describe("planted demo findings (§15.7 — every detector fires)", () => {
  it("D1 duplicate_charge fires on the $89.99 FITLIFE pair", async () => {
    const rows = await adminDb()
      .select()
      .from(anomalies)
      .where(eq(anomalies.workspaceId, workspaceId));
    const d1 = rows.filter((a) => a.type === "duplicate_charge");
    expect(d1.length).toBeGreaterThanOrEqual(1);
    expect(d1.some((a) => a.title.includes("-89.99"))).toBe(true);
  });

  it("D2 fee_spike fires on the $39.95×3 month vs ~$4.95 baseline", async () => {
    const rows = await adminDb()
      .select()
      .from(anomalies)
      .where(eq(anomalies.workspaceId, workspaceId));
    expect(rows.some((a) => a.type === "fee_spike")).toBe(true);
  });

  it("D3 large_transaction fires on the $18,500 wire", async () => {
    const rows = await adminDb()
      .select()
      .from(anomalies)
      .where(eq(anomalies.workspaceId, workspaceId));
    const d3 = rows.filter((a) => a.type === "large_transaction");
    expect(d3.some((a) => a.title.includes("-18500"))).toBe(true);
  });

  it("D4 allocation_drift fires on the last-quarter equity walk (nightly-only)", async () => {
    const rows = await adminDb()
      .select()
      .from(anomalies)
      .where(eq(anomalies.workspaceId, workspaceId));
    expect(rows.some((a) => a.type === "allocation_drift")).toBe(true);
  });

  it("D5 data_integrity fires on the TSLA pre-history oversell", async () => {
    const rows = await adminDb()
      .select()
      .from(anomalies)
      .where(eq(anomalies.workspaceId, workspaceId));
    const d5 = rows.filter((a) => a.type === "data_integrity");
    expect(d5.some((a) => a.title.includes("incomplete history"))).toBe(true);
  });

  it("D6 account_inactivity fires via a user rule on the silent checking account (US-07)", async () => {
    await withRls(userId, async (db) => {
      await db.execute(rawSql`
        insert into alert_rules (workspace_id, type, name, params)
        values (${workspaceId}, 'account_inactivity', 'Quiet accounts', ${JSON.stringify({ days: 45 })})
      `);
      const result = await runDetectorsForWorkspace(ctxFor(db), db, TODAY, {
        includeNightlyOnly: true,
      });
      expect(result.notified).toBeGreaterThanOrEqual(1);
    });
    const notes = await adminDb()
      .select()
      .from(notifications)
      .where(eq(notifications.workspaceId, workspaceId));
    expect(notes.some((n) => n.title.includes("Quiet accounts"))).toBe(true);
  });

  it("high-severity anomalies also notify with anomaly-scoped dedup keys (§14.4)", async () => {
    const notes = await adminDb()
      .select()
      .from(notifications)
      .where(eq(notifications.workspaceId, workspaceId));
    expect(notes.some((n) => n.dedupKey.startsWith("anomaly:"))).toBe(true);
  });
});

describe("dedup + parity (§14.6)", () => {
  it("double-run inserts zero new anomalies and zero new notifications (US-07 suppression)", async () => {
    const before = await counts();
    const result = await withRls(userId, (db) =>
      runDetectorsForWorkspace(ctxFor(db), db, TODAY, { includeNightlyOnly: true }),
    );
    expect(result.inserted).toBe(0);
    expect(result.notified).toBe(0);
    const after = await counts();
    expect(after).toEqual(before);
  });

  it("preview matches the actual detector logic on the same window (§05.8 shared path)", async () => {
    // A threshold that catches the planted wire in the last 90 days before seed date.
    const preview = await withRls(userId, (db) =>
      previewAlertRule(
        ctxFor(db),
        db,
        { type: "large_transaction", name: "parity", enabled: true, params: { threshold: "15000" } },
        TODAY,
      ),
    );
    expect(preview.window).toBe("90d");
    expect(preview.wouldTrigger).toBeGreaterThanOrEqual(1); // the 2026-04-18 wire
    // Parity: the same registry run over the same window yields the same count.
    const { detectorRegistry } = await import("@/server/engine/detect/registry");
    const { loadDetectorInput } = await import("@/server/services/detection");
    const direct = await withRls(userId, async (db) => {
      const detectorInput = await loadDetectorInput(ctxFor(db), db, TODAY);
      const cutoff = new Date(Date.parse(TODAY) - 90 * 86_400_000).toISOString().slice(0, 10);
      return detectorRegistry.large_transaction.run(
        { ...detectorInput, transactions: detectorInput.transactions.filter((t) => t.date >= cutoff) },
        { threshold: "15000" },
      ).length;
    });
    expect(preview.wouldTrigger).toBe(direct);
  });

  it("detector failure isolation: one bad rule does not sink the run (§14.5-3)", async () => {
    await withRls(userId, async (db) => {
      await db.execute(rawSql`
        insert into alert_rules (workspace_id, type, name, params)
        values (${workspaceId}, 'fee_spike', 'Broken rule', ${JSON.stringify({ sigma: 99 })})
      `);
      const result = await runDetectorsForWorkspace(ctxFor(db), db, TODAY, {
        includeNightlyOnly: false,
      });
      expect(result.failures.length).toBeGreaterThanOrEqual(1); // the out-of-range params rule
    });
  });
});

async function counts(): Promise<{ anomalies: number; notifications: number }> {
  const a = await adminDb().select().from(anomalies).where(eq(anomalies.workspaceId, workspaceId));
  const n = await adminDb()
    .select()
    .from(notifications)
    .where(eq(notifications.workspaceId, workspaceId));
  return { anomalies: a.length, notifications: n.length };
}
