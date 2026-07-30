import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  money,
  moneyToString,
  qty,
  qtyToString,
  type Money,
  type Qty,
} from "@/lib/schemas/primitives";

describe("money (§16.2 — exact decimal parse, ×10⁴ minor units)", () => {
  it("parses decimal strings exactly with no float intermediate", () => {
    expect(money("1234.5")).toBe(12345000n);
    expect(money("0.0001")).toBe(1n);
    expect(money("-0.0001")).toBe(-1n);
    expect(money("0")).toBe(0n);
    expect(money(42)).toBe(420000n);
    // the classic float trap: 0.1 + 0.2
    expect(money("0.1") + money("0.2")).toBe(money("0.3"));
  });

  it("rejects excess precision rather than silently rounding", () => {
    expect(() => money("1.00001")).toThrow(/scale/);
    expect(() => qty("1.000000001")).toThrow(/scale/);
  });

  it("rejects garbage", () => {
    for (const bad of ["", "abc", "1.2.3", "1e5", "NaN", "--1"]) {
      expect(() => money(bad), bad).toThrow();
    }
  });

  it("round-trips: format(parse(s)) === canonical 4dp string (property)", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 18n), max: 10n ** 18n }),
        (units) => {
          const m = units as Money;
          expect(money(moneyToString(m))).toBe(m);
        },
      ),
    );
  });

  it("qty round-trips at ×10⁸ (property)", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 20n), max: 10n ** 20n }),
        (units) => {
          const q = units as Qty;
          expect(qty(qtyToString(q))).toBe(q);
        },
      ),
    );
  });
});
