import type { Money, Qty } from "@/lib/schemas";

/**
 * CostBasisMethod seam — §12.6. Average-cost ships in MVP (implemented by the
 * replay loop via proportional-cost math); fifo and specific_lot are strategy
 * implementations over the same replay loop, with lot-tracking state internal
 * to the strategy. Failing-by-design test stubs in cost-basis.test.ts mark
 * the expected behavior (§12.6/§22).
 */
export type CostBasisMethod = "average" | "fifo" | "specific_lot";

export type LotSale = {
  soldQty: Qty;
  costOfSold: Money;
  realizedPnl: Money;
};

export const SHIPPED_METHODS: readonly CostBasisMethod[] = ["average"];

export function assertShipped(method: CostBasisMethod): void {
  if (!SHIPPED_METHODS.includes(method)) {
    throw new Error(
      `CostBasisMethod '${method}' is a §12.6 extension seam — not shipped in MVP`,
    );
  }
}
