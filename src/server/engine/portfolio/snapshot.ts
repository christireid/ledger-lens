import type { CurrencyCode, InstrumentId, MarketDate, Money, Qty } from "@/lib/schemas";
import {
  avgCostOf,
  qtyTimesPrice,
  toPresentation,
} from "@/server/engine/portfolio/money-math";
import { replay } from "@/server/engine/portfolio/replay";
import type {
  ComputedSnapshot,
  EngineTx,
  PositionFlagName,
  PricingSource,
  SnapshotPosition,
} from "@/server/engine/portfolio/types";

/**
 * Snapshot computation — §12.5 (pure). Replay through asOf, value positions
 * via the injected PricingSource, roll up per account / per currency.
 * Currencies NEVER sum (§02.8-4): totals are per-currency vectors.
 */
export function computeSnapshot(
  transactions: readonly EngineTx[],
  asOf: MarketDate,
  pricing: PricingSource,
): ComputedSnapshot {
  const result = replay(transactions, asOf);

  // Merge per-(account,instrument) states into per-instrument positions
  // (§16.3 Position has no account dimension; per-account rollups are separate).
  const currencyByInstrument = new Map<string, CurrencyCode>();
  for (const t of transactions) {
    if (t.instrumentId !== null && !currencyByInstrument.has(t.instrumentId)) {
      currencyByInstrument.set(t.instrumentId, t.currency);
    }
  }

  const merged = new Map<
    string,
    { qty: Qty; costBasis12: bigint; flags: Set<PositionFlagName> }
  >();
  for (const p of result.positions) {
    const m = merged.get(p.instrumentId) ?? {
      qty: 0n as Qty,
      costBasis12: 0n,
      flags: new Set<PositionFlagName>(),
    };
    m.qty = (m.qty + p.qty) as Qty;
    m.costBasis12 += p.costBasis12;
    for (const f of p.flags) m.flags.add(f);
    merged.set(p.instrumentId, m);
  }

  const positions: SnapshotPosition[] = [];
  const perCurrencyPositions = new Map<CurrencyCode, bigint>(); // market value ×10⁴

  for (const [instrumentIdRaw, m] of merged) {
    const instrumentId = instrumentIdRaw as InstrumentId;
    if (m.qty === 0n && m.costBasis12 === 0n && m.flags.size === 0) continue; // fully closed, clean
    const currency = currencyByInstrument.get(instrumentIdRaw) ?? ("USD" as CurrencyCode);
    const flags = new Set(m.flags);

    const price = pricing.priceFor(instrumentId, asOf);
    const costBasis = toPresentation(m.costBasis12);
    const avgCost = avgCostOf(m.costBasis12, m.qty);

    let marketValue: Money;
    if (price !== null) {
      marketValue = toPresentation(qtyTimesPrice(m.qty, price));
    } else {
      // §12.5: no trade ≤ asOf → value at avgCost, flag unpriced.
      marketValue = costBasis;
      flags.add("unpriced");
    }

    // §12.4: flagged positions are excluded from unrealized-P&L totals
    // (included in market value); unrealizedPnl is null when flagged (§16.3).
    const isFlagged = flags.has("incomplete_history") || flags.has("unpriced");
    const unrealizedPnl = isFlagged ? null : ((marketValue - costBasis) as Money);

    positions.push({
      instrumentId,
      qty: m.qty,
      costBasis,
      avgCost,
      marketValue,
      unrealizedPnl,
      currency,
      flags: [...flags].sort(),
    });

    perCurrencyPositions.set(
      currency,
      (perCurrencyPositions.get(currency) ?? 0n) + marketValue,
    );
  }
  positions.sort((a, b) => (a.instrumentId < b.instrumentId ? -1 : 1));

  // Per-account rollups: cash + positions valued per account.
  const perAccountMap = new Map<
    string,
    { accountId: string; currency: CurrencyCode; cash: bigint; positionsValue: bigint }
  >();
  for (const c of result.cash) {
    const k = `${c.accountId} ${c.currency}`;
    const e = perAccountMap.get(k) ?? {
      accountId: c.accountId,
      currency: c.currency,
      cash: 0n,
      positionsValue: 0n,
    };
    e.cash += c.balance;
    perAccountMap.set(k, e);
  }
  for (const p of result.positions) {
    const currency = currencyByInstrument.get(p.instrumentId) ?? ("USD" as CurrencyCode);
    const price = pricing.priceFor(p.instrumentId, asOf);
    const value =
      price !== null
        ? toPresentation(qtyTimesPrice(p.qty, price))
        : toPresentation(p.costBasis12);
    const k = `${p.accountId} ${currency}`;
    const e = perAccountMap.get(k) ?? {
      accountId: p.accountId,
      currency,
      cash: 0n,
      positionsValue: 0n,
    };
    e.positionsValue += value;
    perAccountMap.set(k, e);
  }

  const perAccount = [...perAccountMap.values()]
    .map((e) => ({
      accountId: e.accountId as ComputedSnapshot["perAccount"][number]["accountId"],
      currency: e.currency,
      cashValue: e.cash as Money,
      totalValue: (e.cash + e.positionsValue) as Money,
    }))
    .sort((a, b) => (a.accountId < b.accountId ? -1 : 1));

  // Per-currency totals: cash vector + positions vector. Never cross-sum.
  const perCurrency = new Map<CurrencyCode, { totalValue: Money; cashValue: Money }>();
  const cashByCurrency = new Map<CurrencyCode, bigint>();
  for (const c of result.cash) {
    cashByCurrency.set(c.currency, (cashByCurrency.get(c.currency) ?? 0n) + c.balance);
  }
  const allCurrencies = new Set<CurrencyCode>([
    ...cashByCurrency.keys(),
    ...perCurrencyPositions.keys(),
  ]);
  for (const currency of allCurrencies) {
    const cashValue = (cashByCurrency.get(currency) ?? 0n) as Money;
    const positionsValue = perCurrencyPositions.get(currency) ?? 0n;
    perCurrency.set(currency, {
      cashValue,
      totalValue: (cashValue + positionsValue) as Money,
    });
  }

  return {
    asOf,
    positions,
    perAccount,
    perCurrency,
    realizedPnlCum: result.realizedPnlCum,
    rowFlags: result.rowFlags,
    orphanIncome: result.orphanIncome,
    incompleteHistoryCount: positions.filter((p) =>
      p.flags.includes("incomplete_history"),
    ).length,
    overdrawnAccounts: result.cash
      .filter((c) => c.overdrawn)
      .map((c) => ({ accountId: c.accountId, currency: c.currency })),
  };
}
