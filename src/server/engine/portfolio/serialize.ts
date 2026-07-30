import { moneyToString, qtyToString, type Money, type Qty } from "@/lib/schemas";
import type { ComputedSnapshot } from "@/server/engine/portfolio/types";

/**
 * Deterministic JSON shape for golden files and snapshot persistence —
 * decimal strings only (§16.2 wire rule; bigint throws in JSON).
 */
export function serializeSnapshot(s: ComputedSnapshot) {
  return {
    asOf: s.asOf,
    positions: s.positions.map((p) => ({
      instrumentId: p.instrumentId,
      qty: qtyToString(p.qty),
      costBasis: moneyToString(p.costBasis),
      avgCost: moneyToString(p.avgCost),
      marketValue: moneyToString(p.marketValue),
      unrealizedPnl: p.unrealizedPnl === null ? null : moneyToString(p.unrealizedPnl),
      currency: p.currency,
      flags: p.flags,
    })),
    perAccount: s.perAccount.map((a) => ({
      accountId: a.accountId,
      currency: a.currency,
      cashValue: moneyToString(a.cashValue),
      totalValue: moneyToString(a.totalValue),
    })),
    perCurrency: Object.fromEntries(
      [...s.perCurrency.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([currency, t]) => [
          currency,
          {
            totalValue: moneyToString(t.totalValue),
            cashValue: moneyToString(t.cashValue),
          },
        ]),
    ),
    realizedPnlCum: Object.fromEntries(
      [...s.realizedPnlCum.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([currency, v]) => [currency, moneyToString(v)]),
    ),
    rowFlags: s.rowFlags.map((f) => ({
      txId: f.txId,
      flag: f.flag,
      delta: moneyToString(f.delta as Money),
    })),
    orphanIncome: s.orphanIncome.map((o) => ({
      instrumentId: o.instrumentId,
      income: moneyToString(o.income),
      currency: o.currency,
    })),
    incompleteHistoryCount: s.incompleteHistoryCount,
  };
}

export type SerializedSnapshot = ReturnType<typeof serializeSnapshot>;
export { moneyToString, qtyToString };
export type { Qty };
