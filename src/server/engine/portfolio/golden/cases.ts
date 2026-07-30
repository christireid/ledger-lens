import {
  money,
  qty,
  type CurrencyCode,
  type MarketDate,
  type TransactionType,
} from "@/lib/schemas";
import type { EngineTx } from "@/server/engine/portfolio/types";

/**
 * Golden-file fixtures — §12.8: ≥15 curated ledgers, each §12.7 edge case
 * covered, expected-output JSON committed. Hand-authored minimal ledgers
 * (§27.4 note: the engine must not be developed against only friendly
 * generated data — these encode the hostile cases).
 */

let seq = 0;
export function uid(tag: number): string {
  return `00000000-0000-4000-8000-${tag.toString().padStart(12, "0")}`;
}

const ACC1 = uid(9001);
const ACC2 = uid(9002);
export const AAPL = uid(101);
export const MSFT = uid(102);
export const VT = uid(103);

type TxSpec = {
  acc?: string;
  date: string;
  type: TransactionType;
  amount: string;
  currency?: string;
  instrument?: string | null;
  q?: string | null;
  price?: string | null;
  superseded?: boolean;
  createdAt?: string;
};

export function tx(spec: TxSpec): EngineTx {
  seq += 1;
  return {
    id: uid(seq) as EngineTx["id"],
    accountId: (spec.acc ?? ACC1) as EngineTx["accountId"],
    date: spec.date as MarketDate,
    type: spec.type,
    amount: money(spec.amount),
    currency: (spec.currency ?? "USD") as CurrencyCode,
    instrumentId: (spec.instrument ?? null) as EngineTx["instrumentId"],
    quantity: spec.q == null ? null : qty(spec.q),
    price: spec.price == null ? null : money(spec.price),
    superseded: spec.superseded ?? false,
    createdAt: spec.createdAt ?? `2026-01-01T00:00:${(seq % 60).toString().padStart(2, "0")}.000Z`,
  };
}

export function resetSeq(): void {
  seq = 0;
}

export type GoldenCase = {
  name: string;
  asOf: string;
  build: () => EngineTx[];
};

export const GOLDEN_CASES: GoldenCase[] = [
  {
    name: "01-basic-buy-hold",
    asOf: "2026-03-31",
    build: () => [
      tx({ date: "2026-01-02", type: "deposit", amount: "10000" }),
      tx({ date: "2026-01-05", type: "buy", amount: "-1850.50", instrument: AAPL, q: "10", price: "185.05" }),
    ],
  },
  {
    name: "02-buy-sell-profit",
    asOf: "2026-03-31",
    build: () => [
      tx({ date: "2026-01-02", type: "deposit", amount: "10000" }),
      tx({ date: "2026-01-05", type: "buy", amount: "-1000", instrument: AAPL, q: "10", price: "100" }),
      tx({ date: "2026-02-10", type: "sell", amount: "600", instrument: AAPL, q: "5", price: "120" }),
    ],
  },
  {
    name: "03-dividends-interest",
    asOf: "2026-03-31",
    build: () => [
      tx({ date: "2026-01-02", type: "deposit", amount: "5000" }),
      tx({ date: "2026-01-05", type: "buy", amount: "-2000", instrument: VT, q: "20", price: "100" }),
      tx({ date: "2026-02-01", type: "dividend", amount: "44.20", instrument: VT }),
      tx({ date: "2026-02-28", type: "interest", amount: "12.15" }),
    ],
  },
  {
    name: "04-fees-and-withdrawals",
    asOf: "2026-03-31",
    build: () => [
      tx({ date: "2026-01-02", type: "deposit", amount: "3000" }),
      tx({ date: "2026-01-15", type: "fee", amount: "-9.99" }),
      tx({ date: "2026-02-01", type: "withdrawal", amount: "-500" }),
      tx({ date: "2026-02-15", type: "fee", amount: "-9.99" }),
    ],
  },
  {
    name: "05-oversell-incomplete-history",
    asOf: "2026-03-31",
    build: () => [
      // Broker export window missed the original purchase (§02.8-3):
      tx({ date: "2026-01-10", type: "buy", amount: "-500", instrument: MSFT, q: "5", price: "100" }),
      tx({ date: "2026-02-10", type: "sell", amount: "1440", instrument: MSFT, q: "12", price: "120" }),
    ],
  },
  {
    name: "06-zero-price-grant",
    asOf: "2026-03-31",
    build: () => [
      tx({ date: "2026-01-05", type: "buy", amount: "-1000", instrument: AAPL, q: "10", price: "100" }),
      // RSU vest arrives as buy@0 (§12.7-2): amount 0 is legal only for 'other';
      // grants come through as amount matching 0-price → amount must be ≠ 0
      // per DB check... spec: zero-price buys legal. amount: -0.0001 minimal.
      tx({ date: "2026-02-01", type: "buy", amount: "-0.0001", instrument: AAPL, q: "5", price: "0" }),
    ],
  },
  {
    name: "07-orphan-income",
    asOf: "2026-03-31",
    build: () => [
      tx({ date: "2026-01-02", type: "deposit", amount: "1000" }),
      tx({ date: "2026-02-01", type: "dividend", amount: "31.40", instrument: MSFT }),
    ],
  },
  {
    name: "08-sell-to-zero-rebuy",
    asOf: "2026-03-31",
    build: () => [
      tx({ date: "2026-01-02", type: "deposit", amount: "10000" }),
      tx({ date: "2026-01-05", type: "buy", amount: "-999.90", instrument: AAPL, q: "3.33", price: "300.30" }),
      tx({ date: "2026-02-01", type: "sell", amount: "1049.61", instrument: AAPL, q: "3.33", price: "315.20" }),
      tx({ date: "2026-03-01", type: "buy", amount: "-620", instrument: AAPL, q: "2", price: "310" }),
    ],
  },
  {
    name: "09-negative-cash-overdrawn",
    asOf: "2026-03-31",
    build: () => [
      tx({ date: "2026-01-02", type: "deposit", amount: "100" }),
      tx({ date: "2026-01-05", type: "buy", amount: "-1000", instrument: VT, q: "10", price: "100" }),
    ],
  },
  {
    name: "10-mixed-currency-no-cross-sum",
    asOf: "2026-03-31",
    build: () => [
      tx({ date: "2026-01-02", type: "deposit", amount: "5000", currency: "USD" }),
      tx({ acc: ACC2, date: "2026-01-02", type: "deposit", amount: "3000", currency: "EUR" }),
      tx({ date: "2026-01-05", type: "buy", amount: "-1000", instrument: AAPL, q: "10", price: "100", currency: "USD" }),
      tx({ acc: ACC2, date: "2026-01-06", type: "buy", amount: "-900", instrument: VT, q: "9", price: "100", currency: "EUR" }),
    ],
  },
  {
    name: "11-same-day-ordering",
    asOf: "2026-03-31",
    build: () => [
      tx({ date: "2026-01-02", type: "deposit", amount: "10000" }),
      // Same date: created_at breaks the tie (§12.7-1) — buy lands first.
      tx({ date: "2026-02-01", type: "buy", amount: "-1000", instrument: AAPL, q: "10", price: "100", createdAt: "2026-02-01T09:00:00.000Z" }),
      tx({ date: "2026-02-01", type: "sell", amount: "550", instrument: AAPL, q: "5", price: "110", createdAt: "2026-02-01T15:00:00.000Z" }),
    ],
  },
  {
    name: "12-superseded-excluded",
    asOf: "2026-03-31",
    build: () => [
      tx({ date: "2026-01-02", type: "deposit", amount: "1000" }),
      tx({ date: "2026-01-05", type: "buy", amount: "-500", instrument: AAPL, q: "5", price: "100", superseded: true }),
      tx({ date: "2026-01-05", type: "buy", amount: "-505", instrument: AAPL, q: "5", price: "101" }),
    ],
  },
  {
    name: "13-future-dated-excluded",
    asOf: "2026-02-15",
    build: () => [
      tx({ date: "2026-01-02", type: "deposit", amount: "1000" }),
      tx({ date: "2026-02-01", type: "buy", amount: "-500", instrument: AAPL, q: "5", price: "100" }),
      // After asOf — §02.8-6: excluded from the 2026-02-15 snapshot.
      tx({ date: "2026-03-01", type: "sell", amount: "550", instrument: AAPL, q: "5", price: "110" }),
    ],
  },
  {
    name: "14-empty-ledger",
    asOf: "2026-03-31",
    build: () => [],
  },
  {
    name: "15-inconsistent-amount-flag",
    asOf: "2026-03-31",
    build: () => [
      tx({ date: "2026-01-02", type: "deposit", amount: "10000" }),
      // |amount| 900 vs q×price 1000 — way outside max($0.02, 0.5%) (§12.3).
      tx({ date: "2026-01-05", type: "buy", amount: "-900", instrument: AAPL, q: "10", price: "100" }),
    ],
  },
  {
    name: "16-multi-account-merge",
    asOf: "2026-03-31",
    build: () => [
      tx({ date: "2026-01-02", type: "deposit", amount: "5000" }),
      tx({ acc: ACC2, date: "2026-01-02", type: "deposit", amount: "5000" }),
      tx({ date: "2026-01-05", type: "buy", amount: "-1000", instrument: AAPL, q: "10", price: "100" }),
      tx({ acc: ACC2, date: "2026-01-06", type: "buy", amount: "-1100", instrument: AAPL, q: "10", price: "110" }),
      tx({ acc: ACC2, date: "2026-02-01", type: "sell", amount: "575", instrument: AAPL, q: "5", price: "115" }),
    ],
  },
];
