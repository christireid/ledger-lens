import "server-only";

import { sql as rawSql } from "drizzle-orm";
import { z } from "zod";

import type { MarketDate } from "@/lib/schemas";
import type { Ctx } from "@/server/context";
import type { RlsDb } from "@/server/db/rls";
import { listAnomalies } from "@/server/services/anomalies";
import { periodAggregates, snapshotSeries } from "@/server/services/analytics";
import { resolveRange } from "@/server/services/dashboard";
import { listTransactions } from "@/server/services/transactions";
import type { ToolSpec } from "@/server/ai/transport";

/**
 * AI tool inventory — §08.3: exactly six, read-only, Zod-validated,
 * workspace-scoped through the same service layer as the UI. Each returns
 * compact JSON plus a citation block. Results truncate at 8 KB with an
 * explicit marker.
 */

const RESULT_CAP_BYTES = 8 * 1024;

export type Citation = {
  kind: "transactions" | "snapshot" | "anomalies";
  refIds: string[];
  label: string;
};

export type ToolOutcome = {
  json: string; // ≤8 KB, truncated:true marker when capped
  citation: Citation | null;
};

const FilterArg = z
  .object({
    accountIds: z.array(z.string().uuid()).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    types: z.array(z.string()).optional(),
    q: z.string().max(200).optional(),
    includeArchived: z.boolean().optional(),
  })
  .strict();

const ARG_SCHEMAS = {
  query_transactions: z
    .object({
      filter: FilterArg.default({}),
      limit: z.number().int().min(1).max(50).default(20),
      sort: z.enum(["date", "amount"]).default("date"),
    })
    .strict(),
  aggregate_transactions: z
    .object({
      filter: FilterArg.default({}),
      group_by: z.enum(["account", "type", "instrument", "month"]),
      metric: z.enum(["sum", "count", "avg"]).default("sum"),
    })
    .strict(),
  get_positions: z.object({ as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict(),
  get_snapshot_series: z
    .object({ range: z.enum(["30d", "90d", "ytd", "1y", "all"]).default("90d") })
    .strict(),
  list_anomalies: z
    .object({
      status: z.enum(["open", "acknowledged", "dismissed"]).optional(),
      severity: z.enum(["low", "medium", "high"]).optional(),
    })
    .strict(),
  describe_workspace: z.object({}).strict(),
} as const;

export type ToolName = keyof typeof ARG_SCHEMAS;

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "query_transactions",
    description: "List ledger transactions matching a filter. Returns rows plus total count.",
    parameters: {
      type: "object",
      properties: {
        filter: { type: "object" },
        limit: { type: "integer", maximum: 50 },
        sort: { type: "string", enum: ["date", "amount"] },
      },
    },
  },
  {
    name: "aggregate_transactions",
    description: "Grouped totals over transactions (sum/count/avg by account, type, instrument, or month). Refuses cross-currency sums.",
    parameters: {
      type: "object",
      properties: {
        filter: { type: "object" },
        group_by: { type: "string", enum: ["account", "type", "instrument", "month"] },
        metric: { type: "string", enum: ["sum", "count", "avg"] },
      },
      required: ["group_by"],
    },
  },
  {
    name: "get_positions",
    description: "Latest snapshot positions with cost basis and P&L.",
    parameters: { type: "object", properties: { as_of: { type: "string" } } },
  },
  {
    name: "get_snapshot_series",
    description: "Portfolio value over time from stored snapshots.",
    parameters: { type: "object", properties: { range: { type: "string", enum: ["30d", "90d", "ytd", "1y", "all"] } } },
  },
  {
    name: "list_anomalies",
    description: "Detector findings, filterable by status and severity.",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["open", "acknowledged", "dismissed"] },
        severity: { type: "string", enum: ["low", "medium", "high"] },
      },
    },
  },
  {
    name: "describe_workspace",
    description: "Accounts, date coverage, currencies, and row counts — call this first.",
    parameters: { type: "object", properties: {} },
  },
];

function cap(payload: Record<string, unknown>): string {
  let json = JSON.stringify(payload);
  if (json.length <= RESULT_CAP_BYTES) return json;
  // Truncate arrays until under cap, marking explicitly (§08.3).
  const truncated: Record<string, unknown> = { ...payload, truncated: true };
  for (const key of Object.keys(truncated)) {
    const value = truncated[key];
    if (Array.isArray(value)) {
      let list = value;
      while (list.length > 1 && JSON.stringify({ ...truncated, [key]: list }).length > RESULT_CAP_BYTES) {
        // Keep the most recent entries — tool data is date-ascending.
        list = list.slice(-Math.max(1, Math.floor(list.length / 2)));
      }
      truncated[key] = list;
    }
  }
  json = JSON.stringify(truncated);
  return json.length <= RESULT_CAP_BYTES ? json : json.slice(0, RESULT_CAP_BYTES);
}

export async function executeTool(
  ctx: Ctx,
  db: RlsDb,
  name: ToolName,
  rawArgs: unknown,
): Promise<ToolOutcome> {
  const args = ARG_SCHEMAS[name].parse(rawArgs ?? {});

  switch (name) {
    case "query_transactions": {
      const a = args as z.infer<(typeof ARG_SCHEMAS)["query_transactions"]>;
      const { rows } = await listTransactions(ctx, db, {
        limit: a.limit,
        sort: a.sort,
        dir: "desc",
        ...(a.filter.from ? { from: a.filter.from } : {}),
        ...(a.filter.to ? { to: a.filter.to } : {}),
        ...(a.filter.types ? { types: a.filter.types.join(",") } : {}),
        ...(a.filter.q ? { q: a.filter.q } : {}),
        ...(a.filter.includeArchived ? { includeArchived: true } : {}),
        ...(a.filter.accountIds ? { accountUuids: a.filter.accountIds } : {}),
      });
      const ids = rows.map((r) => r.tx.id);
      return {
        json: cap({
          rows: rows.map((r) => ({
            id: r.tx.id,
            date: r.tx.date,
            type: r.tx.type,
            amount: r.tx.amount,
            currency: r.tx.currency.trim(),
            symbol: r.symbol,
            description: r.tx.description,
          })),
          count: rows.length,
        }),
        citation: ids.length
          ? { kind: "transactions", refIds: ids, label: `${ids.length} txns` }
          : null,
      };
    }

    case "aggregate_transactions": {
      const a = args as z.infer<(typeof ARG_SCHEMAS)["aggregate_transactions"]>;
      // §08.11-4: refuse cross-currency sums server-side.
      const currencies = await db.execute(rawSql`
        select distinct currency from transactions
        where workspace_id = ${ctx.workspaceId} and not superseded
      `);
      const currencyList = (currencies as unknown as Array<{ currency: string }>).map((c) =>
        c.currency.trim(),
      );
      if (currencyList.length > 1 && a.metric !== "count") {
        return {
          json: JSON.stringify({
            error: "cross_currency_sum_refused",
            currencies: currencyList,
            hint: "Aggregate per currency by adding a currency filter, or use metric: count.",
          }),
          citation: null,
        };
      }
      const groupExpr =
        a.group_by === "month"
          ? rawSql`to_char(date, 'YYYY-MM')`
          : a.group_by === "account"
            ? rawSql`account_id::text`
            : a.group_by === "instrument"
              ? rawSql`coalesce(instrument_id::text, 'cash')`
              : rawSql`type::text`;
      const metricExpr =
        a.metric === "count"
          ? rawSql`count(*)::text`
          : a.metric === "avg"
            ? rawSql`avg(amount)::numeric(18,4)::text`
            : rawSql`sum(amount)::numeric(18,4)::text`;
      const conditions = [rawSql`workspace_id = ${ctx.workspaceId}`, rawSql`not superseded`];
      if (a.filter.from) conditions.push(rawSql`date >= ${a.filter.from}`);
      if (a.filter.to) conditions.push(rawSql`date <= ${a.filter.to}`);
      if (a.filter.types?.length) {
        conditions.push(
          rawSql`type in ${rawSql`(${rawSql.join(a.filter.types.map((t) => rawSql`${t}::transaction_type`), rawSql`, `)})`}`,
        );
      }
      const whereClause = rawSql.join(conditions, rawSql` and `);
      const groups = await db.execute(rawSql`
        select ${groupExpr} as key, ${metricExpr} as value, count(*)::int as n,
               (array_agg(id::text))[1:20] as sample_ids
        from transactions
        where ${whereClause}
        group by 1 order by 1
      `);
      const rows = groups as unknown as Array<{ key: string; value: string; n: number; sample_ids: string[] }>;
      const allIds = rows.flatMap((r) => r.sample_ids).slice(0, 100);
      return {
        json: cap({
          groups: rows.map((r) => ({
            key: r.key,
            [a.metric]: r.value,
            count: r.n,
            currency: currencyList[0] ?? "USD",
          })),
        }),
        citation: allIds.length
          ? { kind: "transactions", refIds: allIds, label: `${rows.length} groups` }
          : null,
      };
    }

    case "get_positions": {
      const rows = await db.execute(rawSql`
        select id, as_of::text as as_of, positions from portfolio_snapshots
        where workspace_id = ${ctx.workspaceId}
        order by as_of desc limit 1
      `);
      const snapshot = (rows as unknown as Array<{ id: string; as_of: string; positions: unknown }>)[0];
      if (!snapshot) {
        return { json: JSON.stringify({ positions: [], note: "no snapshots yet" }), citation: null };
      }
      const positions = (snapshot.positions ?? []) as Array<Record<string, unknown>>;
      // Enrich with symbols (snapshot rows store instrument ids).
      const ids = positions
        .map((p) => p.instrumentId)
        .filter((v): v is string => typeof v === "string");
      if (ids.length) {
        const symbolRows = await db.execute(rawSql`
          select id::text as id, symbol from instruments
          where id in ${rawSql`(${rawSql.join(ids.map((i) => rawSql`${i}::uuid`), rawSql`, `)})`}
        `);
        const bySymbol = new Map(
          (symbolRows as unknown as Array<{ id: string; symbol: string }>).map((r) => [r.id, r.symbol]),
        );
        for (const p of positions) {
          p.symbol = bySymbol.get(p.instrumentId as string) ?? null;
        }
        positions.sort((a, b) => Number(b.marketValue ?? 0) - Number(a.marketValue ?? 0));
      }
      return {
        json: cap({ asOf: snapshot.as_of, positions }),
        citation: { kind: "snapshot", refIds: [snapshot.id], label: `Snapshot ${snapshot.as_of}` },
      };
    }

    case "get_snapshot_series": {
      const a = args as z.infer<(typeof ARG_SCHEMAS)["get_snapshot_series"]>;
      const today = new Date().toISOString().slice(0, 10) as MarketDate;
      const { from, to } = resolveRange(a.range, today);
      const points = await snapshotSeries(ctx, db, from, to);
      return {
        json: cap({ points }),
        citation:
          points.length > 0
            ? { kind: "snapshot", refIds: [], label: `${points.length} snapshots` }
            : null,
      };
    }

    case "list_anomalies": {
      const a = args as z.infer<(typeof ARG_SCHEMAS)["list_anomalies"]>;
      const rows = await listAnomalies(ctx, db, { ...a, limit: 20 });
      return {
        json: cap({
          anomalies: rows.map((r) => ({
            id: r.id,
            type: r.type,
            severity: r.severity,
            status: r.status,
            title: r.title,
          })),
        }),
        citation: rows.length
          ? { kind: "anomalies", refIds: rows.flatMap((r) => r.evidenceTxIds).slice(0, 100), label: `${rows.length} findings` }
          : null,
      };
    }

    case "describe_workspace": {
      const summary = await db.execute(rawSql`
        select
          (select count(*)::int from transactions where workspace_id = ${ctx.workspaceId} and not superseded) as tx_count,
          (select min(date)::text from transactions where workspace_id = ${ctx.workspaceId}) as earliest,
          (select max(date)::text from transactions where workspace_id = ${ctx.workspaceId}) as latest,
          (select array_agg(distinct trim(currency)) from transactions where workspace_id = ${ctx.workspaceId}) as currencies
      `);
      const accounts = await db.execute(rawSql`
        select name, type::text as type, archived_at is not null as archived
        from accounts where workspace_id = ${ctx.workspaceId} order by name
      `);
      const s = (summary as unknown as Array<Record<string, unknown>>)[0] ?? {};
      return {
        json: cap({
          transactions: s.tx_count ?? 0,
          dateRange: { earliest: s.earliest ?? null, latest: s.latest ?? null },
          currencies: s.currencies ?? [],
          accounts: accounts as unknown as Array<Record<string, unknown>>,
        }),
        citation: null,
      };
    }
  }
}

export { periodAggregates };
