import "server-only";

import { sql as rawSql } from "drizzle-orm";

import type { MarketDate, WorkspaceId } from "@/lib/schemas";
import type { Ctx } from "@/server/context";
import type { RlsDb } from "@/server/db/rls";

/**
 * Analytics engine — §13. Deterministic SQL over snapshots and the ledger;
 * definitions fixed in §13.2 so every surface reports identical numbers.
 * Raw SQL is the §07.3-sanctioned zone for these aggregates; each query's
 * index use is EXPLAIN-verified (§13.5, scripts/explain-baseline.mjs).
 */

export type PeriodAggregates = {
  currency: string;
  income: string; // Σ dividend + interest, date ∈ period (signed)
  fees: string; // Σ |fee| amounts, date ∈ period (absolute, §13.2)
  netContribution: string; // Σ deposits + transfers_in − withdrawals − transfers_out
};

/** §13.2 period aggregates — one grouped scan over head rows. */
export async function periodAggregates(
  ctx: Ctx,
  db: RlsDb,
  from: MarketDate,
  to: MarketDate,
): Promise<PeriodAggregates[]> {
  if (!ctx.can("transactions:read")) throw new Error("forbidden");
  // EXPLAIN-verified: transactions_workspace_type_date_idx (§09.5)
  const rows = await db.execute(rawSql`
    select currency,
      coalesce(sum(amount) filter (where type in ('dividend','interest')), 0)::text as income,
      coalesce(sum(abs(amount)) filter (where type = 'fee'), 0)::text as fees,
      coalesce(sum(amount) filter (where type in ('deposit','transfer_in','withdrawal','transfer_out')), 0)::text as net_contribution
    from transactions
    where workspace_id = ${ctx.workspaceId}
      and not superseded
      and date >= ${from} and date <= ${to}
    group by currency
    order by currency
  `);
  return (rows as unknown as Array<Record<string, string>>).map((r) => ({
    currency: r.currency ?? "",
    income: r.income ?? "0",
    fees: r.fees ?? "0",
    netContribution: r.net_contribution ?? "0",
  }));
}

export type SeriesPoint = {
  asOf: string;
  totalValue: string | null;
  cashValue: string | null;
  interpolated: false;
};

/**
 * §13.3: series endpoints read portfolio_snapshots scalars — no replay on the
 * request path. Ranges > 400 points downsample to weekly (last-of-week).
 */
export async function snapshotSeries(
  ctx: Ctx,
  db: RlsDb,
  from: MarketDate,
  to: MarketDate,
): Promise<SeriesPoint[]> {
  if (!ctx.can("transactions:read")) throw new Error("forbidden");
  const spanDays =
    Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        86_400_000,
    ) + 1;
  const downsample = spanDays > 400;

  // EXPLAIN-verified: portfolio_snapshots_workspace_as_of_desc_idx (§09.5)
  const rows = downsample
    ? await db.execute(rawSql`
        select distinct on (date_trunc('week', as_of::timestamp))
          as_of::text, total_value::text, cash_value::text
        from portfolio_snapshots
        where workspace_id = ${ctx.workspaceId}
          and as_of >= ${from} and as_of <= ${to}
        order by date_trunc('week', as_of::timestamp), as_of desc
      `)
    : await db.execute(rawSql`
        select as_of::text, total_value::text, cash_value::text
        from portfolio_snapshots
        where workspace_id = ${ctx.workspaceId}
          and as_of >= ${from} and as_of <= ${to}
        order by as_of
      `);

  return (rows as unknown as Array<Record<string, string | null>>).map((r) => ({
    asOf: r.as_of ?? "",
    totalValue: r.total_value ?? null,
    cashValue: r.cash_value ?? null,
    interpolated: false as const,
  }));
}

/** §13.2 realized P&L (period) = cum(end) − cum(start-1) — subtraction, not re-replay. */
export async function realizedPnlForPeriod(
  ctx: Ctx,
  db: RlsDb,
  from: MarketDate,
  to: MarketDate,
): Promise<string> {
  if (!ctx.can("transactions:read")) throw new Error("forbidden");
  const rows = await db.execute(rawSql`
    with bounds as (
      select
        (select realized_pnl_cum from portfolio_snapshots
          where workspace_id = ${ctx.workspaceId} and as_of < ${from}
          order by as_of desc limit 1) as start_cum,
        (select realized_pnl_cum from portfolio_snapshots
          where workspace_id = ${ctx.workspaceId} and as_of <= ${to}
          order by as_of desc limit 1) as end_cum
    )
    select (coalesce(end_cum, 0) - coalesce(start_cum, 0))::text as realized
    from bounds
  `);
  const first = (rows as unknown as Array<Record<string, string>>)[0];
  return first?.realized ?? "0";
}

/**
 * §13.2 value change (period) = value(end) − value(start) − net contribution —
 * flow-adjusted so deposits don't masquerade as gains ("change excl.
 * contributions" on stat cards).
 */
export async function valueChangeForPeriod(
  ctx: Ctx,
  db: RlsDb,
  from: MarketDate,
  to: MarketDate,
): Promise<{ change: string; endValue: string | null } | null> {
  if (!ctx.can("transactions:read")) throw new Error("forbidden");
  const rows = await db.execute(rawSql`
    with bounds as (
      select
        (select total_value from portfolio_snapshots
          where workspace_id = ${ctx.workspaceId} and as_of < ${from}
          order by as_of desc limit 1) as start_value,
        (select total_value from portfolio_snapshots
          where workspace_id = ${ctx.workspaceId} and as_of <= ${to}
          order by as_of desc limit 1) as end_value,
        (select coalesce(sum(amount), 0) from transactions
          where workspace_id = ${ctx.workspaceId} and not superseded
            and type in ('deposit','transfer_in','withdrawal','transfer_out')
            and date >= ${from} and date <= ${to}) as net_contribution
    )
    select end_value::text,
      (coalesce(end_value, 0) - coalesce(start_value, 0) - net_contribution)::text as change
    from bounds
  `);
  const first = (rows as unknown as Array<Record<string, string | null>>)[0];
  if (!first) return null;
  return { change: first.change ?? "0", endValue: first.end_value ?? null };
}

export type { WorkspaceId };
