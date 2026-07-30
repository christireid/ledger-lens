import "server-only";

import { and, asc, desc, eq, gte, inArray, lte, or, sql as rawSql, type SQL } from "drizzle-orm";

import type { z } from "zod";

import type { TransactionsQuerySchema, TxInputSchema } from "@/lib/schemas/api";
import type { Ctx } from "@/server/context";
import { accounts, instruments, transactions } from "@/server/db/schema";
import type { RlsDb } from "@/server/db/rls";
import { ForbiddenError, InvalidCursorError, NotFoundError, ConflictError } from "@/server/errors";

/** Cursor: opaque base64 of (date,id) — stable under inserts, no OFFSET (§09.5). */
export function encodeCursor(date: string, id: string): string {
  return Buffer.from(`${date}|${id}`).toString("base64url");
}
export function decodeCursor(cursor: string): { date: string; id: string } {
  try {
    const [date, id] = Buffer.from(cursor, "base64url").toString().split("|");
    if (!date || !id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error();
    return { date, id };
  } catch {
    throw new InvalidCursorError();
  }
}

type TxQuery = z.infer<typeof TransactionsQuerySchema>;

export async function listTransactions(ctx: Ctx, db: RlsDb, q: TxQuery & { accountUuids?: string[] }) {
  if (!ctx.can("transactions:read")) throw new ForbiddenError();

  const conditions: SQL[] = [eq(transactions.workspaceId, ctx.workspaceId)];
  if (!q.includeSuperseded) conditions.push(eq(transactions.superseded, false));
  if (q.accountUuids?.length) conditions.push(inArray(transactions.accountId, q.accountUuids));
  if (q.from) conditions.push(gte(transactions.date, q.from));
  if (q.to) conditions.push(lte(transactions.date, q.to));
  if (q.types) {
    const types = q.types.split(",").filter(Boolean);
    if (types.length) conditions.push(inArray(transactions.type, types as never));
  }
  if (q.minAmount) conditions.push(rawSql`abs(${transactions.amount}) >= ${q.minAmount}`);
  if (q.maxAmount) conditions.push(rawSql`abs(${transactions.amount}) <= ${q.maxAmount}`);
  if (q.q) {
    // Prefix-match each term ('netflix' finds 'NETFLIX.COM'); accent-insensitive.
    const tsquery = q.q
      .split(/\s+/)
      .map((t) => t.replace(/[^\p{L}\p{N}.]/gu, ""))
      .filter(Boolean)
      .map((t) => `${t}:*`)
      .join(" & ");
    if (tsquery) {
      conditions.push(
        rawSql`to_tsvector('simple', immutable_unaccent(${transactions.description})) @@ to_tsquery('simple', immutable_unaccent(${tsquery}))`,
      );
    }
  }
  if (!q.includeArchived) {
    conditions.push(
      rawSql`${transactions.accountId} in (select id from accounts where workspace_id = ${ctx.workspaceId} and archived_at is null)`,
    );
  }
  if (q.cursor) {
    const { date, id } = decodeCursor(q.cursor);
    conditions.push(
      q.dir === "desc"
        ? (or(
            rawSql`${transactions.date} < ${date}`,
            and(eq(transactions.date, date), rawSql`${transactions.id} < ${id}`),
          ) as SQL)
        : (or(
            rawSql`${transactions.date} > ${date}`,
            and(eq(transactions.date, date), rawSql`${transactions.id} > ${id}`),
          ) as SQL),
    );
  }

  const orderBy =
    q.sort === "amount"
      ? [q.dir === "desc" ? desc(transactions.amount) : asc(transactions.amount), desc(transactions.id)]
      : [
          q.dir === "desc" ? desc(transactions.date) : asc(transactions.date),
          q.dir === "desc" ? desc(transactions.id) : asc(transactions.id),
        ];

  const rows = await db
    .select({
      tx: transactions,
      symbol: instruments.symbol,
    })
    .from(transactions)
    .leftJoin(instruments, eq(transactions.instrumentId, instruments.id))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(q.limit + 1);

  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const last = page.at(-1);
  const cursor =
    hasMore && last && q.sort === "date"
      ? encodeCursor(last.tx.date, last.tx.id)
      : null;
  return { rows: page, cursor };
}

export async function getTransaction(ctx: Ctx, db: RlsDb, id: string) {
  if (!ctx.can("transactions:read")) throw new ForbiddenError();
  const [row] = await db
    .select({ tx: transactions, symbol: instruments.symbol })
    .from(transactions)
    .leftJoin(instruments, eq(transactions.instrumentId, instruments.id))
    .where(and(eq(transactions.id, id), eq(transactions.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!row) throw new NotFoundError();
  // lineage: supersede chain neighbors
  const [supersededBy] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.supersedesId, id), eq(transactions.workspaceId, ctx.workspaceId)))
    .limit(1);
  return { ...row, supersededById: supersededBy?.id ?? null };
}

/** POST /transactions/:id/supersede — head-only guard (§09.9-3); new tx + flag flip. */
export async function supersedeTransaction(
  ctx: Ctx,
  db: RlsDb,
  id: string,
  correction: z.infer<typeof TxInputSchema>,
): Promise<{ newId: string; earliestDate: string }> {
  if (!ctx.can("anomalies:triage")) throw new ForbiddenError();
  const [target] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!target) throw new NotFoundError();
  if (target.superseded) {
    // §09.9-3: chains are linear, head-only edits.
    throw new ConflictError("stale_state", "This transaction has already been superseded.");
  }

  let instrumentId: string | null = null;
  if (correction.symbol) {
    const symbol = correction.symbol.toUpperCase();
    const [existing] = await db
      .insert(instruments)
      .values({ symbol, kind: "equity" })
      .onConflictDoNothing({ target: [instruments.symbol, instruments.kind] })
      .returning({ id: instruments.id });
    if (existing) {
      instrumentId = existing.id;
    } else {
      const [found] = await db
        .select({ id: instruments.id })
        .from(instruments)
        .where(and(eq(instruments.symbol, symbol), eq(instruments.kind, "equity")))
        .limit(1);
      instrumentId = found?.id ?? null;
    }
  }

  const [inserted] = await db
    .insert(transactions)
    .values({
      workspaceId: ctx.workspaceId,
      accountId: target.accountId,
      importBatchId: target.importBatchId,
      sourceLine: target.sourceLine,
      date: correction.date,
      type: correction.type,
      amount: pad4(correction.amount),
      currency: correction.currency ?? target.currency,
      instrumentId,
      quantity: correction.quantity ? pad8(correction.quantity) : null,
      price: correction.price ? pad4(correction.price) : null,
      description: correction.description,
      supersedesId: id,
    })
    .returning({ id: transactions.id });

  await db
    .update(transactions)
    .set({ superseded: true })
    .where(eq(transactions.id, id));

  const earliestDate = correction.date < target.date ? correction.date : target.date;
  return { newId: inserted!.id, earliestDate };
}

function pad4(v: string): string {
  const neg = v.startsWith("-");
  const [w = "0", f = ""] = (neg ? v.slice(1) : v).split(".");
  return `${neg ? "-" : ""}${w}.${f.padEnd(4, "0").slice(0, 4)}`;
}
function pad8(v: string): string {
  const neg = v.startsWith("-");
  const [w = "0", f = ""] = (neg ? v.slice(1) : v).split(".");
  return `${neg ? "-" : ""}${w}.${f.padEnd(8, "0").slice(0, 8)}`;
}

export async function resolveAccountUuids(
  ctx: Ctx,
  db: RlsDb,
  uuids: string[],
): Promise<string[]> {
  if (uuids.length === 0) return [];
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.workspaceId, ctx.workspaceId), inArray(accounts.id, uuids)));
  return rows.map((r) => r.id);
}
