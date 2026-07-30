import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { money, qty, type MarketDate, type Money } from "@/lib/schemas";
import { AAPL, resetSeq, tx, uid } from "@/server/engine/portfolio/golden/cases";
import { lastTradePricingSource } from "@/server/engine/portfolio/pricing";
import { replay } from "@/server/engine/portfolio/replay";
import { computeSnapshot } from "@/server/engine/portfolio/snapshot";
import type { EngineTx } from "@/server/engine/portfolio/types";

/**
 * Property tests — §12.8 (normative list): order-insensitivity, cash
 * conservation, basis never negative, sell-to-zero exactness, oversell split.
 */

const ASOF = "2026-12-31" as MarketDate;

/** Deterministic mini-ledger generator: interleaved deposits/buys/sells. */
const ledgerArb = fc
  .array(
    fc.record({
      kind: fc.constantFrom("deposit", "buy", "sell") as fc.Arbitrary<
        "deposit" | "buy" | "sell"
      >,
      units: fc.integer({ min: 1, max: 500 }), // qty ×10⁻² (0.01..5.00)
      priceCents: fc.integer({ min: 1, max: 100_000 }),
      day: fc.integer({ min: 1, max: 360 }),
    }),
    { minLength: 1, maxLength: 40 },
  )
  .map((specs) => {
    resetSeq();
    return specs.map((s, i) => {
      const date = `2026-${String(Math.floor((s.day - 1) / 30) + 1).padStart(2, "0")}-${String(((s.day - 1) % 28) + 1).padStart(2, "0")}`;
      const q = (s.units / 100).toFixed(2);
      const price = (s.priceCents / 100).toFixed(2);
      const gross = ((s.units * s.priceCents) / 10000).toFixed(4);
      if (s.kind === "deposit") {
        return tx({ date, type: "deposit", amount: (s.priceCents / 100).toFixed(2), createdAt: `2026-01-01T00:00:00.${String(i).padStart(3, "0")}Z` });
      }
      if (s.kind === "buy") {
        return tx({ date, type: "buy", amount: `-${gross}`, instrument: AAPL, q, price, createdAt: `2026-01-01T00:00:00.${String(i).padStart(3, "0")}Z` });
      }
      return tx({ date, type: "sell", amount: gross, instrument: AAPL, q, price, createdAt: `2026-01-01T00:00:00.${String(i).padStart(3, "0")}Z` });
    });
  });

describe("replay properties (§12.8)", () => {
  it("is order-insensitive to input array order", () => {
    fc.assert(
      fc.property(ledgerArb, fc.gen(), (ledger, g) => {
        const shuffled = [...ledger];
        // Fisher–Yates with fast-check's deterministic generator
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = g(fc.nat, { max: i });
          const a = shuffled[i]!;
          shuffled[i] = shuffled[j]!;
          shuffled[j] = a;
        }
        const r1 = computeSnapshot(ledger, ASOF, lastTradePricingSource(ledger));
        const r2 = computeSnapshot(shuffled, ASOF, lastTradePricingSource(shuffled));
        expect(JSON.stringify(serialize(r1))).toBe(JSON.stringify(serialize(r2)));
      }),
      { numRuns: 60 },
    );

    function serialize(s: ReturnType<typeof computeSnapshot>) {
      return {
        positions: s.positions.map((p) => ({ ...p, qty: p.qty.toString(), costBasis: p.costBasis.toString(), avgCost: p.avgCost.toString(), marketValue: p.marketValue.toString(), unrealizedPnl: p.unrealizedPnl?.toString() ?? null })),
        perCurrency: [...s.perCurrency.entries()].map(([c, t]) => [c, t.totalValue.toString(), t.cashValue.toString()]),
      };
    }
  });

  it("conserves cash: final balance = Σ signed amounts (non-superseded, ≤ asOf)", () => {
    fc.assert(
      fc.property(ledgerArb, (ledger) => {
        const result = replay(ledger, ASOF);
        const expected = ledger
          .filter((t) => !t.superseded && t.date <= ASOF)
          .reduce((acc, t) => acc + t.amount, 0n);
        const actual = result.cash.reduce((acc, c) => acc + c.balance, 0n);
        expect(actual).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it("basis never negative", () => {
    fc.assert(
      fc.property(ledgerArb, (ledger) => {
        const result = replay(ledger, ASOF);
        for (const p of result.positions) {
          expect(p.costBasis12 >= 0n).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("oversell split: covered + uncovered === q, uncovered realizes zero", () => {
    resetSeq();
    const ledger = [
      tx({ date: "2026-01-05", type: "buy", amount: "-300", instrument: AAPL, q: "3", price: "100" }),
      tx({ date: "2026-02-05", type: "sell", amount: "1000", instrument: AAPL, q: "10", price: "100" }),
    ];
    const result = replay(ledger, ASOF);
    const p = result.positions[0]!;
    expect(p.qty).toBe(qty("-7"));
    // covered 3 realize 3×(100−100)=0 here; use a profit case too:
    resetSeq();
    const ledger2 = [
      tx({ date: "2026-01-05", type: "buy", amount: "-300", instrument: AAPL, q: "3", price: "100" }),
      tx({ date: "2026-02-05", type: "sell", amount: "1200", instrument: AAPL, q: "10", price: "120" }),
    ];
    const r2 = replay(ledger2, ASOF);
    const p2 = r2.positions[0]!;
    // only the covered 3 realize: 3×20 = 60 — the uncovered 7 contribute 0.
    expect(r2.realizedPnlCum.get(ledger2[0]!.currency)).toBe(money("60"));
    expect(p2.flags.has("incomplete_history")).toBe(true);
  });

  it("sell-to-zero leaves basis exactly 0 (integer-math guarantee, §12.7-4)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }), // qty units ×10⁻⁴
        fc.integer({ min: 1, max: 1_000_000 }), // price cents
        (qUnits, priceCents) => {
          resetSeq();
          const q = (qUnits / 10000).toFixed(4);
          const price = (priceCents / 100).toFixed(2);
          const ledger = [
            tx({ date: "2026-01-05", type: "buy", amount: "-1", instrument: AAPL, q, price }),
            tx({ date: "2026-02-05", type: "sell", amount: "1", instrument: AAPL, q, price }),
          ];
          const result = replay(ledger, ASOF);
          const p = result.positions[0]!;
          expect(p.qty).toBe(0n);
          expect(p.costBasis12).toBe(0n);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("engine unit cases (§12.5/§12.7)", () => {
  it("unpriced position values at avgCost with flag (custom pricing source)", () => {
    resetSeq();
    const ledger = [
      tx({ date: "2026-01-05", type: "buy", amount: "-1000", instrument: AAPL, q: "10", price: "100" }),
    ];
    const noPricing = { priceFor: () => null };
    const snapshot = computeSnapshot(ledger, ASOF, noPricing);
    const p = snapshot.positions[0]!;
    expect(p.flags).toContain("unpriced");
    expect(p.marketValue).toBe(money("1000")); // valued at cost
    expect(p.unrealizedPnl).toBeNull();
  });

  it("zero-price buy dilutes avgCost and flags zero_price_lot (§12.7-2)", () => {
    resetSeq();
    const ledger = [
      tx({ date: "2026-01-05", type: "buy", amount: "-1000", instrument: AAPL, q: "10", price: "100" }),
      tx({ date: "2026-02-05", type: "buy", amount: "-0.0001", instrument: AAPL, q: "10", price: "0" }),
    ];
    const snapshot = computeSnapshot(ledger, ASOF, lastTradePricingSource(ledger));
    const p = snapshot.positions[0]!;
    expect(p.qty).toBe(qty("20"));
    expect(p.avgCost).toBe(money("50")); // 1000 / 20 — diluted
    expect(p.flags).toContain("zero_price_lot");
  });

  it("empty ledger yields a valid zero snapshot (§12.7-6)", () => {
    const snapshot = computeSnapshot([], ASOF, { priceFor: () => null });
    expect(snapshot.positions).toHaveLength(0);
    expect(snapshot.perCurrency.size).toBe(0);
    expect(snapshot.incompleteHistoryCount).toBe(0);
  });

  it("inconsistent amount within tolerance does NOT flag; outside does (§12.3)", () => {
    resetSeq();
    const within = [
      // expected 1000, actual 1000.01 — inside $0.02
      tx({ date: "2026-01-05", type: "buy", amount: "-1000.01", instrument: AAPL, q: "10", price: "100" }),
    ];
    expect(replay(within, ASOF).rowFlags).toHaveLength(0);
    resetSeq();
    const outside = [
      tx({ date: "2026-01-05", type: "buy", amount: "-1010", instrument: AAPL, q: "10", price: "100" }),
    ];
    const flags = replay(outside, ASOF).rowFlags;
    expect(flags).toHaveLength(1);
    expect(flags[0]!.flag).toBe("inconsistent_amount");
  });

  it("uses a different instrument id for orphan detection than held ones", () => {
    resetSeq();
    const other = uid(999);
    const ledger: EngineTx[] = [
      tx({ date: "2026-01-05", type: "buy", amount: "-1000", instrument: AAPL, q: "10", price: "100" }),
      tx({ date: "2026-02-01", type: "dividend", amount: "10", instrument: other }),
    ];
    const result = replay(ledger, ASOF);
    expect(result.orphanIncome).toHaveLength(1);
    expect(result.orphanIncome[0]!.instrumentId).toBe(other);
    expect(result.orphanIncome[0]!.income).toBe(money("10") as Money);
  });
});
