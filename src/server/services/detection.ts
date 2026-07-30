import "server-only";

import { sql as rawSql } from "drizzle-orm";

import type { CurrencyCode, MarketDate } from "@/lib/schemas";
import type { Ctx } from "@/server/context";
import type { RlsDb } from "@/server/db/rls";
import { lastTradePricingSource } from "@/server/engine/portfolio/pricing";
import { computeSnapshot } from "@/server/engine/portfolio/snapshot";
import type { EngineTx } from "@/server/engine/portfolio/types";
import type { DetectorInput, DetectorTx } from "@/server/engine/detect/types";

/**
 * DetectorInput loader — assembles head rows + latest snapshot + the D4
 * equity-allocation series from stored snapshots (§14.2). One loader for
 * post-commit runs, nightly runs, and the S-08 preview (shared path).
 */
export async function loadDetectorInput(
  ctx: Ctx,
  db: RlsDb,
  asOf: MarketDate,
): Promise<DetectorInput> {
  const result = await db.execute(rawSql`
    select id, account_id, date::text as date, type, amount::text as amount,
           currency, instrument_id, quantity::text as quantity, price::text as price,
           superseded, created_at, description
    from transactions
    where workspace_id = ${ctx.workspaceId} and not superseded
  `);
  const rows = result as unknown as Array<Record<string, string | boolean | Date | null>>;
  const transactions: DetectorTx[] = rows.map((r) => ({
    id: r.id as EngineTx["id"],
    accountId: r.account_id as EngineTx["accountId"],
    date: r.date as MarketDate,
    type: r.type as EngineTx["type"],
    amount: BigInt((r.amount as string).replace(".", "")) as EngineTx["amount"],
    currency: r.currency as CurrencyCode,
    instrumentId: r.instrument_id as EngineTx["instrumentId"],
    quantity: r.quantity === null ? null : (BigInt((r.quantity as string).replace(".", "")) as EngineTx["quantity"]),
    price: r.price === null ? null : (BigInt((r.price as string).replace(".", "")) as EngineTx["price"]),
    superseded: Boolean(r.superseded),
    createdAt: new Date(r.created_at as Date).toISOString(),
    description: (r.description as string) ?? "",
  }));

  const snapshot =
    transactions.length > 0
      ? computeSnapshot(transactions, asOf, lastTradePricingSource(transactions))
      : null;

  // D4 series: equity share of total per stored snapshot (positions jsonb).
  const seriesRows = await db.execute(rawSql`
    select as_of::text as as_of, total_value::text as total_value, positions
    from portfolio_snapshots
    where workspace_id = ${ctx.workspaceId}
    order by as_of
  `);
  const snapshotSeries = (seriesRows as unknown as Array<{
    as_of: string;
    total_value: string | null;
    positions: Array<{ marketValue: string; flags?: string[]; currency: string; instrumentId: string }> | null;
  }>).map((row) => {
    const total = row.total_value === null ? 0 : Number(row.total_value);
    if (!row.positions || total <= 0) return { asOf: row.as_of, equityPct: null };
    const equity = row.positions.reduce(
      (acc, p) => acc + Math.max(0, Number(p.marketValue)),
      0,
    );
    return { asOf: row.as_of, equityPct: (equity / total) * 100 };
  });

  return { transactions, snapshot, snapshotSeries, asOf };
}
