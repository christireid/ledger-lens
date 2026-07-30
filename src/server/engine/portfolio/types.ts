import type {
  AccountId,
  CurrencyCode,
  InstrumentId,
  MarketDate,
  Money,
  Qty,
  TransactionId,
  TransactionType,
} from "@/lib/schemas";

/**
 * Engine input/output shapes — §12. The engine is pure: (transactions[],
 * asOf, options) → EngineResult. No I/O, no clock, no randomness.
 */

/** The engine's view of a ledger row (subset of the §16.3 Transaction). */
export type EngineTx = {
  id: TransactionId;
  accountId: AccountId;
  date: MarketDate;
  type: TransactionType;
  amount: Money; // signed, account-currency (§09.3)
  currency: CurrencyCode;
  instrumentId: InstrumentId | null;
  quantity: Qty | null;
  price: Money | null;
  superseded: boolean;
  createdAt: string; // ISO — part of the (date, created_at, id) total order
};

export type PositionFlagName =
  | "incomplete_history"
  | "unpriced"
  | "zero_price_lot";

/** Per (account, instrument) replay state — §12.3. */
export type PositionState = {
  accountId: AccountId;
  instrumentId: InstrumentId;
  qty: Qty; // may be negative on oversell — preserved, not clamped (§12.4)
  costBasis12: bigint; // internal scale ×10¹² (money 10⁴ × qty 10⁸)
  realizedPnl12: bigint;
  flags: Set<PositionFlagName>;
};

export type CashState = {
  accountId: AccountId;
  currency: CurrencyCode;
  balance: Money;
  overdrawn: boolean; // §12.4: negative cash allowed, flagged
};

export type RowFlag = {
  txId: TransactionId;
  flag: "inconsistent_amount";
  /** |amount| − q×price delta, money units, for detector evidence (§12.3). */
  delta: Money;
};

export type OrphanIncome = {
  instrumentId: InstrumentId;
  income: Money;
  currency: CurrencyCode;
};

export type ReplayResult = {
  positions: PositionState[];
  cash: CashState[];
  rowFlags: RowFlag[];
  /** §12.7-3: income for instruments never held — evidence of missing history. */
  orphanIncome: OrphanIncome[];
  /** Cumulative realized P&L (presentation scale) per currency — §13.3 scalar. */
  realizedPnlCum: Map<CurrencyCode, Money>;
};

/** §12.5 / §02.9 seam: pricing is injected, engine stays pure. */
export type PricingSource = {
  priceFor: (instrumentId: InstrumentId, asOf: MarketDate) => Money | null;
};

export type SnapshotPosition = {
  instrumentId: InstrumentId;
  qty: Qty;
  costBasis: Money;
  avgCost: Money;
  marketValue: Money;
  unrealizedPnl: Money | null; // null when flagged (§16.3)
  currency: CurrencyCode;
  flags: PositionFlagName[];
};

export type SnapshotTotals = {
  totalValue: Money;
  cashValue: Money;
};

export type ComputedSnapshot = {
  asOf: MarketDate;
  positions: SnapshotPosition[];
  perAccount: Array<{
    accountId: AccountId;
    totalValue: Money;
    cashValue: Money;
    currency: CurrencyCode;
  }>;
  perCurrency: Map<CurrencyCode, SnapshotTotals>;
  realizedPnlCum: Map<CurrencyCode, Money>;
  rowFlags: RowFlag[];
  orphanIncome: OrphanIncome[];
  incompleteHistoryCount: number;
};
