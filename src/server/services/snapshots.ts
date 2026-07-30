import "server-only";

import { sql as rawSql } from "drizzle-orm";

import {
  moneyToString,
  type CurrencyCode,
  type MarketDate,
  type WorkspaceId,
} from "@/lib/schemas";
import type { RlsDb } from "@/server/db/rls";
import { lastTradePricingSource } from "@/server/engine/portfolio/pricing";
import { serializeSnapshot } from "@/server/engine/portfolio/serialize";
import { computeSnapshot } from "@/server/engine/portfolio/snapshot";
import type { EngineTx } from "@/server/engine/portfolio/types";

/**
 * Snapshot orchestration — §12.5 (impure shell around the pure core).
 * Takes the workspace advisory lock, recomputes today's snapshot plus missing
 * daily snapshots over the affected range (bounded to 366 backfill days per
 * run — Vercel timeout budget §07.11-1; older gaps fill on successive nightly
 * runs), writes computed_at + reproducibility watermark, releases the lock.
 */

export const BACKFILL_BOUND_DAYS = 366;

function addDays(date: MarketDate, days: number): MarketDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10) as MarketDate;
}

type TxRow = {
  id: string;
  account_id: string;
  date: string;
  type: string;
  amount: string;
  currency: string;
  instrument_id: string | null;
  quantity: string | null;
  price: string | null;
  superseded: boolean;
  created_at: string | Date;
};

export async function recomputeSnapshots(
  db: RlsDb,
  workspaceId: WorkspaceId,
  opts: {
    today: MarketDate;
    /** earliest date touched by the triggering import; undefined = today only */
    earliestAffectedDate?: MarketDate;
  },
): Promise<{ written: number; partialBackfill: boolean }> {
  // §07.3: advisory lock serializes recomputation per workspace.
  await db.execute(
    rawSql`select pg_advisory_xact_lock(hashtext(${workspaceId}))`,
  );

  // §12.5/§13.2: headline scalars are the BASE-currency vector entry — the
  // workspace's configured base currency, never a hardcoded one.
  const wsRows = (await db.execute(
    rawSql`select base_currency from workspaces where id = ${workspaceId}`,
  )) as unknown as Array<{ base_currency: string }>;
  const baseCurrency = (wsRows[0]?.base_currency ?? "USD") as CurrencyCode;

  const result = await db.execute(rawSql`
    select id, account_id, date, type, amount, currency, instrument_id,
           quantity, price, superseded, created_at
    from transactions
    where workspace_id = ${workspaceId} and not superseded
  `);
  const rows = result as unknown as TxRow[];

  const engineTxs: EngineTx[] = rows.map((r) => ({
    id: r.id as EngineTx["id"],
    accountId: r.account_id as EngineTx["accountId"],
    date: r.date as MarketDate,
    type: r.type as EngineTx["type"],
    amount: BigInt(r.amount.replace(".", "")) as EngineTx["amount"], // numeric(18,4) always 4 dp
    currency: r.currency as CurrencyCode,
    instrumentId: r.instrument_id as EngineTx["instrumentId"],
    quantity:
      r.quantity === null
        ? null
        : (BigInt(r.quantity.replace(".", "")) as EngineTx["quantity"]),
    price:
      r.price === null
        ? null
        : (BigInt(r.price.replace(".", "")) as EngineTx["price"]),
    superseded: r.superseded,
    createdAt: new Date(r.created_at).toISOString(),
  }));

  const watermark = rows.length
    ? new Date(
        Math.max(...rows.map((r) => new Date(r.created_at).getTime())),
      ).toISOString()
    : null;

  // Determine the date range to (re)compute.
  const earliest = opts.earliestAffectedDate ?? opts.today;
  const fullSpanDays =
    Math.round(
      (Date.parse(`${opts.today}T00:00:00Z`) -
        Date.parse(`${earliest}T00:00:00Z`)) /
        86_400_000,
    ) + 1;
  const partialBackfill = fullSpanDays > BACKFILL_BOUND_DAYS;
  const startDate = partialBackfill
    ? addDays(opts.today, -(BACKFILL_BOUND_DAYS - 1))
    : earliest;

  const pricing = lastTradePricingSource(engineTxs);
  let written = 0;
  for (
    let date = startDate;
    date <= opts.today;
    date = addDays(date, 1)
  ) {
    const snapshot = computeSnapshot(engineTxs, date, pricing);
    const serialized = serializeSnapshot(snapshot);
    const base = snapshot.perCurrency.get(baseCurrency) ?? {
      totalValue: 0n,
      cashValue: 0n,
    };
    const realized =
      snapshot.realizedPnlCum.get(baseCurrency) ?? (0n as never);
    const flags = partialBackfill && date === opts.today ? ["partial_backfill"] : [];
    const flagsLiteral = `{${flags.join(",")}}`;

    await db.execute(rawSql`
      insert into portfolio_snapshots
        (workspace_id, as_of, computed_at, total_value, cash_value,
         realized_pnl_cum, schema_version, positions, per_account, per_currency,
         input_max_tx_created_at, flags)
      values
        (${workspaceId}, ${date}, now(),
         ${moneyToString(base.totalValue as never)},
         ${moneyToString(base.cashValue as never)},
         ${moneyToString(realized)},
         1,
         ${JSON.stringify(serialized.positions)},
         ${JSON.stringify(serialized.perAccount)},
         ${JSON.stringify(serialized.perCurrency)},
         ${watermark},
         ${flagsLiteral}::text[])
      on conflict (workspace_id, as_of) do update set
        computed_at = excluded.computed_at,
        total_value = excluded.total_value,
        cash_value = excluded.cash_value,
        realized_pnl_cum = excluded.realized_pnl_cum,
        schema_version = excluded.schema_version,
        positions = excluded.positions,
        per_account = excluded.per_account,
        per_currency = excluded.per_currency,
        input_max_tx_created_at = excluded.input_max_tx_created_at,
        flags = excluded.flags
    `);
    written += 1;
  }

  return { written, partialBackfill };
}
