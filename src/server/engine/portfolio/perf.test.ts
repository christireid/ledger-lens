import { describe, expect, it } from "vitest";

import { money, qty, type CurrencyCode, type MarketDate } from "@/lib/schemas";
import { lastTradePricingSource } from "@/server/engine/portfolio/pricing";
import { computeSnapshot } from "@/server/engine/portfolio/snapshot";
import type { EngineTx } from "@/server/engine/portfolio/types";

/**
 * §12.8: recompute of 50k rows < 20 s p95 (§07.6 budget). Generated with a
 * fixed PRNG until the M4 demo dataset back-fills this input (§27.4 note).
 */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generate50k(): EngineTx[] {
  const rand = mulberry32(0x5eed);
  const instruments = Array.from({ length: 40 }, (_, i) =>
    `00000000-0000-4000-8000-${(200 + i).toString().padStart(12, "0")}`,
  );
  const accounts = Array.from({ length: 5 }, (_, i) =>
    `00000000-0000-4000-8000-${(900 + i).toString().padStart(12, "0")}`,
  );
  const rows: EngineTx[] = [];
  for (let i = 0; i < 50_000; i++) {
    const day = Math.floor(rand() * 1400);
    const year = 2022 + Math.floor(day / 365);
    const month = 1 + (Math.floor(day / 30) % 12);
    const dom = 1 + (day % 28);
    const date = `${year}-${String(month).padStart(2, "0")}-${String(dom).padStart(2, "0")}` as MarketDate;
    const roll = rand();
    const accountId = accounts[Math.floor(rand() * accounts.length)]! as EngineTx["accountId"];
    const id = `00000000-0000-4000-9000-${i.toString().padStart(12, "0")}` as EngineTx["id"];
    const createdAt = `2026-01-01T00:00:00.000Z`;
    const base = { id, accountId, date, currency: "USD" as CurrencyCode, superseded: false, createdAt };
    if (roll < 0.3) {
      rows.push({ ...base, type: "deposit", amount: money((100 + Math.floor(rand() * 5000)).toString()), instrumentId: null, quantity: null, price: null });
    } else if (roll < 0.65) {
      const q = 1 + Math.floor(rand() * 50);
      const price = 10 + Math.floor(rand() * 500);
      rows.push({ ...base, type: "buy", amount: money((-q * price).toString()), instrumentId: instruments[Math.floor(rand() * instruments.length)]! as EngineTx["instrumentId"], quantity: qty(q.toString()), price: money(price.toString()) });
    } else if (roll < 0.85) {
      const q = 1 + Math.floor(rand() * 20);
      const price = 10 + Math.floor(rand() * 500);
      rows.push({ ...base, type: "sell", amount: money((q * price).toString()), instrumentId: instruments[Math.floor(rand() * instruments.length)]! as EngineTx["instrumentId"], quantity: qty(q.toString()), price: money(price.toString()) });
    } else if (roll < 0.95) {
      rows.push({ ...base, type: "dividend", amount: money((1 + Math.floor(rand() * 100)).toString()), instrumentId: instruments[Math.floor(rand() * instruments.length)]! as EngineTx["instrumentId"], quantity: null, price: null });
    } else {
      rows.push({ ...base, type: "fee", amount: money((-1 - Math.floor(rand() * 30)).toString()), instrumentId: null, quantity: null, price: null });
    }
  }
  return rows;
}

describe("50k perf gate (§12.8)", () => {
  it("replays + snapshots 50k rows well under the 20 s budget", () => {
    const rows = generate50k();
    const started = performance.now();
    const snapshot = computeSnapshot(
      rows,
      "2026-12-31" as MarketDate,
      lastTradePricingSource(rows),
    );
    const elapsed = performance.now() - started;
    expect(snapshot.positions.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(20_000);
  });
});
