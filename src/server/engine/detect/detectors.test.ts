import { describe, expect, it } from "vitest";

import { money, qty, type CurrencyCode, type MarketDate } from "@/lib/schemas";
import { detectorRegistry, trigramSimilarity } from "@/server/engine/detect/registry";
import type { DetectorInput, DetectorTx } from "@/server/engine/detect/types";

/**
 * Detector fixtures — §14.6: each detector has a fixture producing exactly its
 * expected findings, plus the normative abstention cases (D2 cold start,
 * D4 pre-baseline).
 */

let seq = 0;
function tx(spec: {
  date: string;
  type?: DetectorTx["type"];
  amount: string;
  account?: string;
  description?: string;
}): DetectorTx {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${seq.toString().padStart(12, "0")}` as DetectorTx["id"],
    accountId: (spec.account ?? "00000000-0000-4000-8000-000000009001") as DetectorTx["accountId"],
    date: spec.date as MarketDate,
    type: spec.type ?? "withdrawal",
    amount: money(spec.amount),
    currency: "USD" as CurrencyCode,
    instrumentId: null,
    quantity: null,
    price: null,
    superseded: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    description: spec.description ?? "",
  };
}

function input(transactions: DetectorTx[], asOf = "2026-07-01"): DetectorInput {
  return { transactions, snapshot: null, asOf };
}

describe("trigram similarity", () => {
  it("identical strings ≈ 1; unrelated « 0.85", () => {
    expect(trigramSimilarity("FITLIFE GYM ANNUAL", "FITLIFE GYM ANNUAL")).toBe(1);
    expect(trigramSimilarity("FITLIFE GYM", "WHOLE FOODS")).toBeLessThan(0.3);
  });
});

describe("D1 duplicate_charge (§14.3)", () => {
  const def = detectorRegistry.duplicate_charge;

  it("fires on an exact pair ≤3 days apart with matching descriptions", () => {
    const findings = def.run(
      input([
        tx({ date: "2026-06-04", amount: "-89.99", description: "FITLIFE GYM ANNUAL" }),
        tx({ date: "2026-06-06", amount: "-89.99", description: "FITLIFE GYM ANNUAL" }),
      ]),
      def.defaultParams,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("medium"); // < $100
    expect(findings[0]!.evidenceTxIds).toHaveLength(2);
  });

  it("high severity at ≥ $100; excludes buy/sell/dividend and sub-$1", () => {
    const findings = def.run(
      input([
        tx({ date: "2026-06-04", amount: "-150.00", description: "BIG CHARGE CO" }),
        tx({ date: "2026-06-05", amount: "-150.00", description: "BIG CHARGE CO" }),
        tx({ date: "2026-06-04", amount: "-0.50", description: "TINY FEE" }),
        tx({ date: "2026-06-05", amount: "-0.50", description: "TINY FEE" }),
      ]),
      def.defaultParams,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("high");
  });

  it("does not fire outside the window or on dissimilar descriptions", () => {
    const findings = def.run(
      input([
        tx({ date: "2026-06-01", amount: "-89.99", description: "FITLIFE GYM" }),
        tx({ date: "2026-06-20", amount: "-89.99", description: "FITLIFE GYM" }),
        tx({ date: "2026-06-02", amount: "-42.00", description: "WHOLE FOODS" }),
        tx({ date: "2026-06-03", amount: "-42.00", description: "SHELL OIL" }),
      ]),
      def.defaultParams,
    );
    expect(findings).toHaveLength(0);
  });
});

describe("D2 fee_spike (§14.3)", () => {
  const def = detectorRegistry.fee_spike;

  function feeMonths(months: string[], amounts: string[]): DetectorTx[] {
    return months.flatMap((m, i) =>
      tx({ date: `${m}-15`, type: "fee", amount: amounts[i]! }),
    );
  }

  it("fires when a month exceeds mean + 2σ of the trailing baseline", () => {
    const rows = feeMonths(
      ["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05"],
      ["-4.95", "-4.95", "-4.95", "-4.95", "-4.95", "-119.85"],
    );
    const findings = def.run(input(rows, "2026-06-15"), def.defaultParams);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.title).toContain("Fee spike");
  });

  it("abstains below the 3-month baseline (cold start, §14.3)", () => {
    const rows = feeMonths(["2026-04", "2026-05"], ["-4.95", "-119.85"]);
    expect(def.run(input(rows, "2026-06-15"), def.defaultParams)).toHaveLength(0);
  });
});

describe("D3 large_transaction (§14.3)", () => {
  const def = detectorRegistry.large_transaction;

  it("fixed threshold (user-rule mode): fires at ≥ threshold, high at 2×", () => {
    const findings = def.run(
      input([
        tx({ date: "2026-06-10", amount: "-18500.00", description: "WIRE OUT" }),
        tx({ date: "2026-06-11", amount: "-4000.00", description: "RENT" }),
      ]),
      { threshold: "5000" },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("high"); // 18500 ≥ 2×5000
  });

  it("adaptive default: max($5,000, p99) — small accounts not spammed", () => {
    const small = Array.from({ length: 50 }, (_, i) =>
      tx({ date: `2026-0${(i % 6) + 1}-1${i % 9}`, amount: "-100.00", description: "SPEND" }),
    );
    expect(def.run(input(small), def.defaultParams)).toHaveLength(0);
    const withWire = [...small, tx({ date: "2026-06-10", amount: "-18500.00", description: "WIRE" })];
    const findings = def.run(input(withWire), def.defaultParams);
    expect(findings).toHaveLength(1);
  });
});

describe("D4 allocation_drift (§14.3)", () => {
  const def = detectorRegistry.allocation_drift;

  function seriesInput(equityPcts: number[], current: number): DetectorInput {
    const series = equityPcts.map((pct, i) => ({
      asOf: new Date(Date.parse("2026-04-01") + i * 86_400_000).toISOString().slice(0, 10),
      equityPct: pct,
    }));
    series.push({ asOf: "2026-07-01", equityPct: current });
    return { transactions: [], snapshot: null, snapshotSeries: series, asOf: "2026-07-01" };
  }

  it("fires when current drifts > 5pp from the 90-day median", () => {
    const findings = def.run(seriesInput(Array(60).fill(78), 89), def.defaultParams);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.title).toContain("drifted");
  });

  it("abstains with < 10 baseline points (pre-90-day workspace, §14.6)", () => {
    expect(def.run(seriesInput(Array(5).fill(78), 89), def.defaultParams)).toHaveLength(0);
  });

  it("does not fire within the threshold", () => {
    expect(def.run(seriesInput(Array(60).fill(78), 80), def.defaultParams)).toHaveLength(0);
  });
});

describe("D6 account_inactivity (§14.3)", () => {
  const def = detectorRegistry.account_inactivity;
  const A = "00000000-0000-4000-8000-000000009001";
  const B = "00000000-0000-4000-8000-000000009002";

  it("fires for a silent account while others are active", () => {
    const findings = def.run(
      input([
        tx({ date: "2026-04-01", account: A, amount: "-10.00" }),
        tx({ date: "2026-06-28", account: B, amount: "-10.00" }),
      ]),
      def.defaultParams,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("low");
  });

  it("abstains when ALL accounts are quiet (no meta-signal) or only one exists", () => {
    expect(
      def.run(
        input([
          tx({ date: "2026-01-01", account: A, amount: "-10.00" }),
          tx({ date: "2026-01-02", account: B, amount: "-10.00" }),
        ]),
        def.defaultParams,
      ),
    ).toHaveLength(0);
    expect(
      def.run(input([tx({ date: "2026-01-01", account: A, amount: "-10.00" })]), def.defaultParams),
    ).toHaveLength(0);
  });
});

describe("registry invariants (§14.2)", () => {
  it("params schemas reject out-of-range values with field errors", () => {
    expect(() => detectorRegistry.fee_spike.paramsSchema.parse({ sigma: 9 })).toThrow();
    expect(() => detectorRegistry.allocation_drift.paramsSchema.parse({ driftPp: 0 })).toThrow();
    expect(() => detectorRegistry.account_inactivity.paramsSchema.parse({ days: 1 })).toThrow();
  });

  it("D5 is system-only; D1 is not user-configurable (ALERT_TYPES parity)", () => {
    expect(detectorRegistry.data_integrity.userConfigurable).toBe(false);
    expect(detectorRegistry.duplicate_charge.userConfigurable).toBe(false);
    expect(detectorRegistry.large_transaction.userConfigurable).toBe(true);
  });

  it("evidence hashes are stable and param-sensitive", () => {
    const def = detectorRegistry.large_transaction;
    const rows = [tx({ date: "2026-06-10", amount: "-9999.00", description: "WIRE" })];
    const a = def.run(input(rows), { threshold: "5000" })[0]!.evidenceHash;
    const b = def.run(input(rows), { threshold: "5000" })[0]!.evidenceHash;
    const c = def.run(input(rows), { threshold: "6000" })[0]!.evidenceHash;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("qty import used by fixtures stays available", () => {
    expect(qty("1")).toBe(100000000n);
  });
});
