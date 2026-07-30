import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  accounts,
  alertRules,
  anomalies,
  importBatches,
  investigations,
  messages,
  notifications,
  portfolioSnapshots,
  transactions,
  workspaces,
} from "@/server/db/schema";
import { adminDb, withRls } from "@/server/db/rls";

/**
 * Cross-tenant probe suite — §09.6/§09.10/§22: a two-user fixture attempting
 * cross-workspace reads on every scoped table. User A probing user B's rows
 * (by ID and by table scan) must see zero rows — RLS is the belt-and-suspenders
 * that turns a service-layer bug into a zero-row result, never a leak.
 */

const userA = `probe_a_${randomUUID().slice(0, 8)}`;
const userB = `probe_b_${randomUUID().slice(0, 8)}`;

type Fixture = {
  wsB: string;
  accountB: string;
  batchB: string;
  txB: string;
  anomalyB: string;
  ruleB: string;
  notificationB: string;
  investigationB: string;
  messageB: string;
  snapshotB: string;
};

let fx: Fixture;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("integration tests require DATABASE_URL (§23.4)");
  }
  const db = adminDb();
  const [wsA] = await db
    .insert(workspaces)
    .values({ clerkUserId: userA, name: "A" })
    .returning();
  const [wsB] = await db
    .insert(workspaces)
    .values({ clerkUserId: userB, name: "B" })
    .returning();
  if (!wsA || !wsB) throw new Error("fixture insert failed");

  const [accountB] = await db
    .insert(accounts)
    .values({ workspaceId: wsB.id, name: "B main", type: "brokerage", currency: "USD" })
    .returning();
  const [batchB] = await db
    .insert(importBatches)
    .values({ workspaceId: wsB.id, contentHash: randomUUID().replace(/-/g, "") })
    .returning();
  if (!accountB || !batchB) throw new Error("fixture insert failed");
  const [txB] = await db
    .insert(transactions)
    .values({
      workspaceId: wsB.id,
      accountId: accountB.id,
      importBatchId: batchB.id,
      date: "2026-01-05",
      type: "deposit",
      amount: "250.0000",
      currency: "USD",
    })
    .returning();
  const [anomalyB] = await db
    .insert(anomalies)
    .values({
      workspaceId: wsB.id,
      type: "duplicate_charge",
      severity: "medium",
      title: "probe",
      evidenceTxIds: [txB!.id],
      evidenceHash: randomUUID(),
    })
    .returning();
  const [ruleB] = await db
    .insert(alertRules)
    .values({
      workspaceId: wsB.id,
      type: "large_transaction",
      name: "probe",
      params: { threshold: "5000.0000" },
    })
    .returning();
  const [notificationB] = await db
    .insert(notifications)
    .values({
      workspaceId: wsB.id,
      title: "probe",
      body: "probe",
      dedupKey: randomUUID(),
    })
    .returning();
  const [investigationB] = await db
    .insert(investigations)
    .values({ workspaceId: wsB.id, title: "probe" })
    .returning();
  const [messageB] = await db
    .insert(messages)
    .values({
      workspaceId: wsB.id,
      investigationId: investigationB!.id,
      role: "user",
      content: "probe",
    })
    .returning();
  const [snapshotB] = await db
    .insert(portfolioSnapshots)
    .values({
      workspaceId: wsB.id,
      asOf: "2026-01-05",
      positions: [],
    })
    .returning();

  fx = {
    wsB: wsB.id,
    accountB: accountB.id,
    batchB: batchB.id,
    txB: txB!.id,
    anomalyB: anomalyB!.id,
    ruleB: ruleB!.id,
    notificationB: notificationB!.id,
    investigationB: investigationB!.id,
    messageB: messageB!.id,
    snapshotB: snapshotB!.id,
  };
});

afterAll(async () => {
  await adminDb()
    .delete(workspaces)
    .where(inArray(workspaces.clerkUserId, [userA, userB]));
});

describe("cross-tenant probes (§09.6 — every scoped table)", () => {
  it("workspaces: A cannot see B", async () => {
    const rows = await withRls(userA, (db) =>
      db.select().from(workspaces).where(eq(workspaces.id, fx.wsB)),
    );
    expect(rows).toHaveLength(0);
  });

  it("accounts: A probing B's account ID sees zero rows", async () => {
    const rows = await withRls(userA, (db) =>
      db.select().from(accounts).where(eq(accounts.id, fx.accountB)),
    );
    expect(rows).toHaveLength(0);
  });

  it("import_batches: zero rows", async () => {
    const rows = await withRls(userA, (db) =>
      db.select().from(importBatches).where(eq(importBatches.id, fx.batchB)),
    );
    expect(rows).toHaveLength(0);
  });

  it("transactions: zero rows by ID and by scan", async () => {
    const byId = await withRls(userA, (db) =>
      db.select().from(transactions).where(eq(transactions.id, fx.txB)),
    );
    const scan = await withRls(userA, (db) => db.select().from(transactions));
    expect(byId).toHaveLength(0);
    expect(scan).toHaveLength(0);
  });

  it("anomalies: zero rows", async () => {
    const rows = await withRls(userA, (db) =>
      db.select().from(anomalies).where(eq(anomalies.id, fx.anomalyB)),
    );
    expect(rows).toHaveLength(0);
  });

  it("alert_rules: zero rows", async () => {
    const rows = await withRls(userA, (db) =>
      db.select().from(alertRules).where(eq(alertRules.id, fx.ruleB)),
    );
    expect(rows).toHaveLength(0);
  });

  it("notifications: zero rows", async () => {
    const rows = await withRls(userA, (db) =>
      db
        .select()
        .from(notifications)
        .where(eq(notifications.id, fx.notificationB)),
    );
    expect(rows).toHaveLength(0);
  });

  it("investigations + messages: zero rows", async () => {
    const inv = await withRls(userA, (db) =>
      db
        .select()
        .from(investigations)
        .where(eq(investigations.id, fx.investigationB)),
    );
    const msg = await withRls(userA, (db) =>
      db.select().from(messages).where(eq(messages.id, fx.messageB)),
    );
    expect(inv).toHaveLength(0);
    expect(msg).toHaveLength(0);
  });

  it("portfolio_snapshots: zero rows", async () => {
    const rows = await withRls(userA, (db) =>
      db
        .select()
        .from(portfolioSnapshots)
        .where(eq(portfolioSnapshots.id, fx.snapshotB)),
    );
    expect(rows).toHaveLength(0);
  });

  it("B sees B (fixture sanity — the probes fail closed, not because data is missing)", async () => {
    const rows = await withRls(userB, (db) =>
      db.select().from(transactions).where(eq(transactions.id, fx.txB)),
    );
    expect(rows).toHaveLength(1);
  });

  it("write probe: A cannot insert into B's workspace (WITH CHECK)", async () => {
    await expect(
      withRls(userA, (db) =>
        db.insert(accounts).values({
          workspaceId: fx.wsB,
          name: "smuggled",
          type: "bank",
          currency: "USD",
        }),
      ),
    ).rejects.toThrow();
  });
});
