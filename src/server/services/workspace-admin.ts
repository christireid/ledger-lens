import "server-only";

import { eq } from "drizzle-orm";

import type { Ctx } from "@/server/context";
import { accounts, importBatches, instruments, workspaces } from "@/server/db/schema";
import type { RlsDb } from "@/server/db/rls";
import { ForbiddenError, NotFoundError } from "@/server/errors";
// eslint-disable-next-line no-restricted-imports -- shared .mjs generator (§15.7)
import { generateDemoDataset } from "../../../supabase/seed/demo-dataset.mjs";

export async function getWorkspace(ctx: Ctx, db: RlsDb) {
  const [row] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, ctx.workspaceId))
    .limit(1);
  if (!row) throw new NotFoundError();
  return row;
}

export async function patchWorkspace(
  ctx: Ctx,
  db: RlsDb,
  patch: { name?: string | undefined; baseCurrency?: string | undefined },
) {
  if (!ctx.can("workspace:settings")) throw new ForbiddenError();
  const [row] = await db
    .update(workspaces)
    .set(patch)
    .where(eq(workspaces.id, ctx.workspaceId))
    .returning();
  return row!;
}

/** §09.8 danger zone: single-transaction cascade; Clerk user remains. */
export async function deleteWorkspace(ctx: Ctx, db: RlsDb) {
  if (!ctx.can("workspace:delete")) throw new ForbiddenError();
  await db.delete(workspaces).where(eq(workspaces.id, ctx.workspaceId));
}

/**
 * §02.8-10 / §15.7: demo seed into the current workspace. Reseed = clear first
 * + rerun (idempotent). Clear = drop workspace-scoped data, unset is_demo.
 */
export async function demoAction(
  ctx: Ctx,
  db: RlsDb,
  action: "seed" | "clear",
): Promise<{ transactions: number }> {
  if (!ctx.can("workspace:settings")) throw new ForbiddenError();

  // Both actions start by clearing existing workspace data (accounts cascade
  // transactions; batches cascade the rest).
  await db.delete(accounts).where(eq(accounts.workspaceId, ctx.workspaceId));
  await db.delete(importBatches).where(eq(importBatches.workspaceId, ctx.workspaceId));

  if (action === "clear") {
    await db
      .update(workspaces)
      .set({ isDemo: false })
      .where(eq(workspaces.id, ctx.workspaceId));
    return { transactions: 0 };
  }

  const dataset = generateDemoDataset();
  await db
    .update(workspaces)
    .set({ isDemo: true })
    .where(eq(workspaces.id, ctx.workspaceId));

  const accountIds: Record<string, string> = {};
  for (const account of dataset.accounts) {
    const [row] = await db
      .insert(accounts)
      .values({
        workspaceId: ctx.workspaceId,
        name: account.name,
        type: account.type as "brokerage" | "bank" | "card",
        institution: account.institution,
        currency: account.currency,
      })
      .returning({ id: accounts.id });
    accountIds[account.key] = row!.id;
  }

  const instrumentIds: Record<string, string> = {};
  for (const inst of dataset.instruments) {
    const [inserted] = await db
      .insert(instruments)
      .values({ symbol: inst.symbol, kind: inst.kind as "equity" | "etf", name: inst.name, currency: inst.currency })
      .onConflictDoNothing({ target: [instruments.symbol, instruments.kind] })
      .returning({ id: instruments.id });
    if (inserted) {
      instrumentIds[inst.symbol] = inserted.id;
    } else {
      const [found] = await db
        .select({ id: instruments.id })
        .from(instruments)
        .where(eq(instruments.symbol, inst.symbol))
        .limit(1);
      instrumentIds[inst.symbol] = found!.id;
    }
  }

  const [batch] = await db
    .insert(importBatches)
    .values({
      workspaceId: ctx.workspaceId,
      fileName: "demo-seed",
      contentHash: `demo-${dataset.version}-${ctx.workspaceId}`,
      status: "committed",
      stats: { accepted: dataset.transactions.length, rejected: 0, duplicates: 0 },
    })
    .returning({ id: importBatches.id });

  const { transactions: txTable } = await import("@/server/db/schema");
  const CHUNK = 500;
  for (let i = 0; i < dataset.transactions.length; i += CHUNK) {
    const chunk = dataset.transactions.slice(i, i + CHUNK);
    await db.insert(txTable).values(
      chunk.map((t, j) => ({
        workspaceId: ctx.workspaceId,
        accountId: accountIds[t.accountKey]!,
        importBatchId: batch!.id,
        sourceLine: i + j + 1,
        date: t.date,
        type: t.type as never,
        amount: t.amount,
        currency: t.currency,
        instrumentId: t.symbol ? (instrumentIds[t.symbol] ?? null) : null,
        quantity: t.quantity ?? null,
        price: t.price ?? null,
        description: t.description,
      })),
    );
  }
  return { transactions: dataset.transactions.length };
}
