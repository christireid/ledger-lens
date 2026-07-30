import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WorkspaceIdSchema, type WorkspaceId } from "@/lib/schemas";
import { buildCtx, type Ctx } from "@/server/context";
import { accounts, importBatches, transactions, workspaces } from "@/server/db/schema";
import { adminDb, withRls } from "@/server/db/rls";
import {
  commitBatch,
  createDraftBatch,
  dryRunBatch,
  ImportError,
  rejectsCsv,
} from "@/server/services/imports";

/**
 * §15.9/§05.9: commit idempotency (double-click Commit = one batch), whole-file
 * duplicate blocking, wizard state machine edges, rejects CSV contract.
 */

const userId = `import_user_${randomUUID().slice(0, 8)}`;
let workspaceId: WorkspaceId;
let accountId: string;

const CSV = new TextEncoder().encode(
  [
    "Date,Description,Amount,Type,Symbol,Quantity,Price",
    "2026-01-05,ACME PAYROLL,2500.00,deposit,,,",
    "2026-01-06,GROCERY MART,-82.13,debit,,,",
    "2026-01-07,YOU BOUGHT AAPL,-1850.50,bought,AAPL,10,185.05",
    "not-a-date,BAD ROW,-10.00,debit,,,",
  ].join("\r\n"),
);

function ctxFor(db: unknown): Ctx {
  return buildCtx({ userId, workspaceId, db });
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("integration tests require DATABASE_URL (§23.4)");
  }
  const db = adminDb();
  const [ws] = await db
    .insert(workspaces)
    .values({ clerkUserId: userId, name: "Imports" })
    .returning();
  workspaceId = WorkspaceIdSchema.parse(ws!.id);
  const [account] = await db
    .insert(accounts)
    .values({ workspaceId: ws!.id, name: "Test Checking", type: "bank", currency: "USD" })
    .returning();
  accountId = account!.id;
});

afterAll(async () => {
  await adminDb().delete(workspaces).where(eq(workspaces.clerkUserId, userId));
});

describe("import pipeline service (§15.5)", () => {
  let batchId: string;
  const idempotencyKey = randomUUID();

  it("creates a draft with auto-mapping", async () => {
    const result = await withRls(userId, (db) =>
      createDraftBatch(ctxFor(db), db, { name: "test.csv", content: CSV }),
    );
    batchId = result.batchId;
    expect(result.suggestedMapping.date).toBe(0);
    expect(result.suggestedMapping.amount).toBe(2);
  });

  it("commit before validation is a 409-shaped error (state machine)", async () => {
    await expect(
      withRls(userId, (db) =>
        commitBatch(ctxFor(db), db, batchId, { content: CSV }, { accountId, idempotencyKey }),
      ),
    ).rejects.toThrow(ImportError);
  });

  it("dry-run: 3 accepted, 1 rejected; nothing committed (§15.4)", async () => {
    const result = await withRls(userId, (db) =>
      dryRunBatch(ctxFor(db), db, batchId, { content: CSV }),
    );
    expect(result.accepted).toHaveLength(3);
    expect(result.rejected).toEqual([
      expect.objectContaining({ line: 4, code: "date_unparseable" }),
    ]);
    const txCount = await adminDb()
      .select()
      .from(transactions)
      .where(eq(transactions.workspaceId, workspaceId));
    expect(txCount).toHaveLength(0);
  });

  it("commit inserts rows with lineage and upserts the instrument", async () => {
    const result = await withRls(userId, (db) =>
      commitBatch(ctxFor(db), db, batchId, { content: CSV }, { accountId, idempotencyKey }),
    );
    expect(result.inserted).toBe(3);
    expect(result.alreadyCommitted).toBe(false);
    expect(result.earliestDate).toBe("2026-01-05");
    const rows = await adminDb()
      .select()
      .from(transactions)
      .where(eq(transactions.workspaceId, workspaceId));
    expect(rows).toHaveLength(3);
    const trade = rows.find((r) => r.type === "buy")!;
    expect(trade.instrumentId).not.toBeNull();
    expect(trade.sourceLine).toBe(3);
    expect(trade.amount).toBe("-1850.5000");
  });

  it("double-commit with the same idempotency key inserts nothing new (§07.11-2)", async () => {
    const result = await withRls(userId, (db) =>
      commitBatch(ctxFor(db), db, batchId, { content: CSV }, { accountId, idempotencyKey }),
    );
    expect(result.alreadyCommitted).toBe(true);
    const rows = await adminDb()
      .select()
      .from(transactions)
      .where(eq(transactions.workspaceId, workspaceId));
    expect(rows).toHaveLength(3);
  });

  it("re-uploading the same file is blocked with the original batch id (US-02)", async () => {
    try {
      await withRls(userId, (db) =>
        createDraftBatch(ctxFor(db), db, { name: "again.csv", content: CSV }),
      );
      expect.fail("expected duplicate_file");
    } catch (err) {
      if (!(err instanceof ImportError)) throw err;
      expect(err.code).toBe("duplicate_file");
      expect(err.meta?.originalBatchId).toBe(batchId);
    }
  });

  it("cross-batch probable dupes are flagged and skipped by default (§15.4)", async () => {
    const csv2 = new TextEncoder().encode(
      [
        "Date,Description,Amount,Type",
        "2026-01-06,GROCERY MART,-82.13,debit", // dupe of committed row
        "2026-02-01,NEW UNIQUE ROW,-5.00,debit",
      ].join("\r\n"),
    );
    const draft = await withRls(userId, (db) =>
      createDraftBatch(ctxFor(db), db, { name: "second.csv", content: csv2 }),
    );
    const dryRun = await withRls(userId, (db) =>
      dryRunBatch(ctxFor(db), db, draft.batchId, { content: csv2 }),
    );
    expect(dryRun.crossBatchDupes).toHaveLength(1);
    const committed = await withRls(userId, (db) =>
      commitBatch(ctxFor(db), db, draft.batchId, { content: csv2 }, {
        accountId,
        idempotencyKey: randomUUID(),
      }),
    );
    expect(committed.inserted).toBe(1); // dupe skipped
  });

  it("mapping profile: same header signature offers the committed mapping (§15.3)", async () => {
    const csv3 = new TextEncoder().encode(
      ["Date,Description,Amount,Type", "2026-03-01,THIRD FILE ROW,-7.00,debit"].join("\r\n"),
    );
    const draft = await withRls(userId, (db) =>
      createDraftBatch(ctxFor(db), db, { name: "third.csv", content: csv3 }),
    );
    expect(draft.suggestedMapping).toMatchObject({ date: 0, description: 1, amount: 2, type: 3 });
  });

  it("rejects CSV reproduces original columns + reject_reason (§15.6)", async () => {
    const [batch] = await adminDb()
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, batchId));
    const rejected = batch!.rejectedRows as Array<{
      line: number; field: string; code: never; message: string; raw: string[];
    }>;
    const csv = rejectsCsv(
      ["Date", "Description", "Amount", "Type", "Symbol", "Quantity", "Price"],
      rejected,
    );
    expect(csv).toContain("reject_reason");
    expect(csv).toContain("not-a-date");
    expect(csv).toContain("date_unparseable");
  });

  it("rejects CSV neutralizes leading formula characters (§21.7)", () => {
    const csv = rejectsCsv(
      ["Date", "Description"],
      [
        {
          line: 2,
          field: "date",
          code: "date_unparseable" as never,
          message: "bad",
          raw: ["=cmd|' /C calc'!A0", "@SUM(1+1)"],
        },
      ],
    );
    const dataLine = csv.split("\r\n")[1]!;
    for (const cell of ["'=cmd", "'@SUM"]) {
      expect(dataLine).toContain(cell);
    }
    expect(/(^|,)[=+@]/.test(dataLine)).toBe(false);
  });
});
