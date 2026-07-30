import type { InstrumentId, MarketDate, Money } from "@/lib/schemas";
import type { EngineTx, PricingSource } from "@/server/engine/portfolio/types";

/**
 * PricingSource — §12.5 / §02.9 seam. MVP LastTradePricingSource: most recent
 * buy/sell price for the instrument ≤ asOf across the workspace. A market-data
 * feed implementation slots in without engine changes (§12.6).
 */
export function lastTradePricingSource(
  transactions: readonly EngineTx[],
): PricingSource {
  // (instrumentId → sorted trades) built once; pure and deterministic.
  const trades = new Map<string, Array<{ date: MarketDate; createdAt: string; id: string; price: Money }>>();
  for (const t of transactions) {
    if (t.superseded) continue;
    if (t.type !== "buy" && t.type !== "sell") continue;
    if (t.instrumentId === null || t.price === null) continue;
    const list = trades.get(t.instrumentId) ?? [];
    list.push({ date: t.date, createdAt: t.createdAt, id: t.id, price: t.price });
    trades.set(t.instrumentId, list);
  }
  for (const list of trades.values()) {
    list.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  return {
    priceFor(instrumentId: InstrumentId, asOf: MarketDate): Money | null {
      const list = trades.get(instrumentId);
      if (!list) return null;
      // last trade ≤ asOf
      let result: Money | null = null;
      for (const trade of list) {
        if (trade.date > asOf) break;
        result = trade.price;
      }
      return result;
    },
  };
}
