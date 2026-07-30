import {
  AccountIdSchema,
  BatchIdSchema,
  InstrumentIdSchema,
  IsoTimestampSchema,
  MarketDateSchema,
  money,
  moneyToString,
  qty,
  qtyToString,
  TransactionIdSchema,
  TransactionSchema,
  WorkspaceIdSchema,
  type IsoTimestamp,
  type Money,
  type Qty,
  type Transaction,
} from "@/lib/schemas";
import type { transactions } from "@/server/db/schema";

/**
 * Marshal layer — §16.4. DB row ↔ entity mapping functions; THE ONLY place
 * numeric-string ↔ bigint conversion happens. bigint throws in JSON natively,
 * so this layer is the single JSON boundary and always emits strings (§16.6).
 * No `any`/`as` casts beyond brand construction via parse (§16.6 lint gate).
 */

type TransactionRow = typeof transactions.$inferSelect;
type TransactionInsert = typeof transactions.$inferInsert;

export function moneyFromDb(value: string): Money {
  return money(value);
}

export function moneyToDb(value: Money): string {
  return moneyToString(value);
}

export function qtyFromDb(value: string): Qty {
  return qty(value);
}

export function qtyToDb(value: Qty): string {
  return qtyToString(value);
}

export function timestampFromDb(value: Date): IsoTimestamp {
  return IsoTimestampSchema.parse(value.toISOString());
}

/** DB row → canonical entity (§16.3 shape, workspace scoping stripped by caller policy). */
export function transactionFromRow(row: TransactionRow): Transaction {
  return TransactionSchema.parse({
    id: TransactionIdSchema.parse(row.id),
    accountId: AccountIdSchema.parse(row.accountId),
    batchId: BatchIdSchema.parse(row.importBatchId),
    date: MarketDateSchema.parse(row.date),
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    instrumentId:
      row.instrumentId === null ? null : InstrumentIdSchema.parse(row.instrumentId),
    quantity: row.quantity,
    price: row.price,
    description: row.description,
    sourceLine: row.sourceLine ?? 0,
    supersedesId:
      row.supersedesId === null ? null : TransactionIdSchema.parse(row.supersedesId),
    superseded: row.superseded,
    createdAt: timestampFromDb(row.createdAt),
  });
}

/** Canonical entity → DB insert shape (workspaceId supplied by the service Ctx). */
export function transactionToRow(
  entity: Transaction,
  workspaceId: string,
): TransactionInsert {
  return {
    id: entity.id,
    workspaceId: WorkspaceIdSchema.parse(workspaceId),
    accountId: entity.accountId,
    importBatchId: entity.batchId,
    sourceLine: entity.sourceLine,
    date: entity.date,
    type: entity.type,
    amount: moneyToDb(entity.amount),
    currency: entity.currency,
    instrumentId: entity.instrumentId,
    quantity: entity.quantity === null ? null : qtyToDb(entity.quantity),
    price: entity.price === null ? null : moneyToDb(entity.price),
    description: entity.description,
    supersedesId: entity.supersedesId,
    superseded: entity.superseded,
  };
}

/**
 * Wire serialization for a Transaction — decimal strings for Money/Qty
 * (§16.2: JSON numbers banned for money).
 */
export function transactionToWire(entity: Transaction) {
  return {
    ...entity,
    amount: moneyToDb(entity.amount),
    quantity: entity.quantity === null ? null : qtyToDb(entity.quantity),
    price: entity.price === null ? null : moneyToDb(entity.price),
  };
}
