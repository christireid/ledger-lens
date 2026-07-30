import type { Money, Qty } from "@/lib/schemas";

/**
 * Integer money math — §12.2-4: all arithmetic in scaled bigints (amounts
 * ×10⁴, quantities ×10⁸); no IEEE floats anywhere in the engine. Internal
 * intermediate scale is ×10¹² (money 10⁴ × qty 10⁸ products are exact);
 * banker's rounding happens once, at final presentation (scale-12 → scale-4).
 */

export const MONEY_TO_12 = 10n ** 8n; // ×10⁴ → ×10¹²
const HALF_DIVISOR = 10n ** 8n;

/** Money (×10⁴) → internal ×10¹². Exact. */
export function toInternal(m: Money): bigint {
  return m * MONEY_TO_12;
}

/** qty(×10⁸) × price(×10⁴) → internal ×10¹². Exact — no rounding. */
export function qtyTimesPrice(q: Qty, p: Money): bigint {
  return q * p;
}

/**
 * Proportional cost of selling `q` out of `qtyHeld` from `costBasis12`.
 * Truncating division — deterministic; exact when q === qtyHeld, which is what
 * guarantees §12.7-4 sell-to-zero basis === 0.
 */
export function proportionalCost12(
  costBasis12: bigint,
  q: Qty,
  qtyHeld: Qty,
): bigint {
  if (qtyHeld === 0n) return 0n;
  return (costBasis12 * q) / qtyHeld;
}

/** Internal ×10¹² → presentation Money ×10⁴ with banker's rounding (§12.2-4). */
export function toPresentation(v12: bigint): Money {
  const negative = v12 < 0n;
  const abs = negative ? -v12 : v12;
  const quotient = abs / HALF_DIVISOR;
  const remainder = abs % HALF_DIVISOR;
  const half = HALF_DIVISOR / 2n;
  let rounded = quotient;
  if (remainder > half) {
    rounded += 1n;
  } else if (remainder === half) {
    // round half to even
    if (quotient % 2n === 1n) rounded += 1n;
  }
  return (negative ? -rounded : rounded) as Money;
}

/**
 * avgCost (presentation Money per unit) = costBasis12 / qty, banker's-rounded.
 * costBasis12/qty is money×10¹² per qty×10⁸ → money×10⁴ exactly the target scale.
 */
export function avgCostOf(costBasis12: bigint, q: Qty): Money {
  if (q === 0n) return 0n as Money;
  const negativeResult = costBasis12 < 0n !== q < 0n;
  const absCost = costBasis12 < 0n ? -costBasis12 : costBasis12;
  const absQ = q < 0n ? -q : q;
  const quotient = absCost / absQ;
  const remainder = absCost % absQ;
  const doubled = remainder * 2n;
  let rounded = quotient;
  if (doubled > absQ) {
    rounded += 1n;
  } else if (doubled === absQ && quotient % 2n === 1n) {
    rounded += 1n;
  }
  return (negativeResult ? -rounded : rounded) as Money;
}

export function absMoney(m: Money): Money {
  return (m < 0n ? -m : m) as Money;
}

export function maxMoney(a: Money, b: Money): Money {
  return (a > b ? a : b) as Money;
}
