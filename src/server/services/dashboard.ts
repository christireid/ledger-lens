import "server-only";

import { and, desc, eq, sql as rawSql } from "drizzle-orm";

import type { MarketDate } from "@/lib/schemas";
import type { RangeKey } from "@/lib/schemas/api";
import type { Ctx } from "@/server/context";
import { anomalies, portfolioSnapshots } from "@/server/db/schema";
import type { RlsDb } from "@/server/db/rls";
import { ForbiddenError } from "@/server/errors";
import {
  periodAggregates,
  realizedPnlForPeriod,
  snapshotSeries,
  valueChangeForPeriod,
} from "@/server/services/analytics";

/** §13.3 range semantics: presets resolve to closed market-date ranges. */
export function resolveRange(range: RangeKey, today: MarketDate): { from: MarketDate; to: MarketDate } {
  const to = today;
  const back = (days: number) =>
    new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000)
      .toISOString()
      .slice(0, 10) as MarketDate;
  switch (range) {
    case "30d":
      return { from: back(30), to };
    case "90d":
      return { from: back(90), to };
    case "1y":
      return { from: back(365), to };
    case "ytd":
      return { from: `${today.slice(0, 4)}-01-01` as MarketDate, to };
    case "all":
      return { from: "1990-01-01" as MarketDate, to };
  }
}

/** GET /dashboard — one aggregate call (§05.4). */
export async function getDashboard(ctx: Ctx, db: RlsDb, range: RangeKey, today: MarketDate) {
  if (!ctx.can("transactions:read")) throw new ForbiddenError();
  const { from, to } = resolveRange(range, today);

  const [latest] = await db
    .select()
    .from(portfolioSnapshots)
    .where(eq(portfolioSnapshots.workspaceId, ctx.workspaceId))
    .orderBy(desc(portfolioSnapshots.asOf))
    .limit(1);

  const [series, aggregates, realized, change, openAnomalies] = await Promise.all([
    snapshotSeries(ctx, db, from, to),
    periodAggregates(ctx, db, from, to),
    realizedPnlForPeriod(ctx, db, from, to),
    valueChangeForPeriod(ctx, db, from, to),
    db
      .select({
        id: anomalies.id,
        type: anomalies.type,
        severity: anomalies.severity,
        title: anomalies.title,
        createdAt: anomalies.createdAt,
      })
      .from(anomalies)
      .where(and(eq(anomalies.workspaceId, ctx.workspaceId), eq(anomalies.status, "open")))
      .orderBy(desc(anomalies.severity), desc(anomalies.createdAt))
      .limit(5),
  ]);

  return {
    range,
    from,
    to,
    latestSnapshot: latest
      ? {
          asOf: latest.asOf,
          computedAt: latest.computedAt?.toISOString() ?? null,
          totalValue: latest.totalValue,
          cashValue: latest.cashValue,
          realizedPnlCum: latest.realizedPnlCum,
          positions: latest.positions,
          perCurrency: latest.perCurrency,
          flags: latest.flags,
        }
      : null,
    series,
    aggregates,
    realizedPnl: realized,
    valueChange: change,
    openAnomalies,
  };
}

/** GET /cron/nightly summary helper — snapshot freshness check (§24). */
export async function snapshotFreshness(ctx: Ctx, db: RlsDb) {
  const [latest] = await db
    .select({ asOf: portfolioSnapshots.asOf, computedAt: portfolioSnapshots.computedAt })
    .from(portfolioSnapshots)
    .where(eq(portfolioSnapshots.workspaceId, ctx.workspaceId))
    .orderBy(desc(portfolioSnapshots.asOf))
    .limit(1);
  return latest ?? null;
}

export { rawSql };
