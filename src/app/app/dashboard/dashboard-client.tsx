"use client";

import Link from "next/link";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { EmptyState } from "@/components/app/empty-state";
import { EvidenceDrawer, type EvidenceDescriptor } from "@/components/app/evidence-drawer";
import { MoneyText } from "@/components/app/money-text";
import { PageHeader } from "@/components/app/page-header";
import { SeverityBadge } from "@/components/app/severity-badge";
import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

// §20.4: Recharts loads with the route, not the shell — dynamic islands.
const ValueAreaChart = dynamic(
  () => import("@/components/charts/dashboard-charts").then((m) => m.ValueAreaChart),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);
const AllocationDonut = dynamic(
  () => import("@/components/charts/dashboard-charts").then((m) => m.AllocationDonut),
  { ssr: false, loading: () => <Skeleton className="h-56 w-full" /> },
);
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api/fetch";
import { qk } from "@/lib/api/keys";

type Position = {
  instrumentId: string;
  qty: string;
  marketValue: string;
  unrealizedPnl: string | null;
  currency: string;
  flags: string[];
};

type DashboardData = {
  range: string;
  latestSnapshot: {
    asOf: string;
    computedAt: string | null;
    totalValue: string | null;
    cashValue: string | null;
    realizedPnlCum: string | null;
    positions: Position[];
    flags: string[];
  } | null;
  series: Array<{ asOf: string; totalValue: string | null }>;
  aggregates: Array<{ currency: string; income: string; fees: string; netContribution: string }>;
  realizedPnl: string;
  unrealizedPnl: string;
  valueChange: { change: string; endValue: string | null } | null;
  openAnomalies: Array<{ id: string; type: string; severity: string; title: string }>;
  recentImports: Array<{
    id: string;
    fileName: string | null;
    status: string;
    stats: { accepted?: number; rejected?: number } | null;
    createdAt: string;
  }>;
};

const RANGES = ["30d", "90d", "ytd", "1y", "all"] as const;

export function DashboardClient() {
  const [range, setRange] = React.useState<string>("90d");
  const [drawer, setDrawer] = React.useState<EvidenceDescriptor | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: qk.dashboard(range),
    queryFn: () => apiFetch<DashboardData>(`/dashboard?range=${range}`),
    staleTime: 5 * 60_000, // §20.6 snapshot-derived data
    refetchOnWindowFocus: false, // §20.6: snapshots change on recompute, not focus
  });

  const d = data?.data;
  const snapshot = d?.latestSnapshot;

  if (isLoading) {
    return (
      <div className="grid grid-cols-12 gap-6" data-testid="dashboard-skeleton">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="col-span-3 h-28" />
        ))}
        <Skeleton className="col-span-8 h-72" />
        <Skeleton className="col-span-4 h-72" />
      </div>
    );
  }

  // True-empty (§05.4): full-page EmptyState with the two US-01 paths.
  if (!snapshot || snapshot.positions.length + Number(snapshot.cashValue !== null) === 0) {
    const noData = !snapshot || (snapshot.totalValue === null || Number(snapshot.totalValue) === 0);
    if (!snapshot || (noData && d?.series.length === 0)) {
      return (
        <>
          <PageHeader title="Dashboard" />
          <EmptyState
            variant="true-empty"
            title="No financial data yet"
            description="Import a CSV export from your broker or bank, or explore with demo data."
            action={
              <div className="flex gap-2">
                <Button asChild>
                  <Link href="/app/imports/new">Import transactions</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/app/settings?tab=workspace">Load demo data</Link>
                </Button>
              </div>
            }
          />
        </>
      );
    }
  }

  const incompleteCount = snapshot?.positions.filter((p) =>
    p.flags.includes("incomplete_history"),
  ).length;

  return (
    <>
      <PageHeader title="Dashboard" />
      {snapshot?.flags.includes("partial_backfill") && (
        <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          History is still backfilling — older dates fill in on the nightly run.
        </div>
      )}
      {incompleteCount ? (
        <div className="mb-4 rounded-md border border-info/40 bg-info/10 p-3 text-sm" data-testid="incomplete-history-notice">
          {incompleteCount} position{incompleteCount === 1 ? "" : "s"} have incomplete history —
          values shown, unrealized P&L excluded.
        </div>
      ) : null}

      <div className="grid grid-cols-12 gap-6">
        {/* Zone 1: four StatCards ×3-col (§05.4) */}
        <StatCard
          label="Total value"
          value={snapshot?.totalValue ?? null}
          delta={d?.valueChange?.change ?? null}
          onClick={() => setDrawer({ kind: "filter", query: "limit=50" })}
        />
        <StatCard
          label="Cash"
          value={snapshot?.cashValue ?? null}
          onClick={() =>
            setDrawer({ kind: "filter", query: "types=deposit,withdrawal,transfer_in,transfer_out&limit=50" })
          }
        />
        <StatCard
          label="Unrealized P&L"
          value={d?.unrealizedPnl ?? null}
          directional
          onClick={() => setDrawer({ kind: "filter", query: "types=buy,sell&limit=50" })}
        />
        <StatCard
          label="Realized P&L"
          value={d?.realizedPnl ?? null}
          directional
          onClick={() => setDrawer({ kind: "filter", query: "types=sell&limit=50" })}
        />

        {/* Zone 2: value-over-time area chart, 8-col */}
        <Card className="col-span-8">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Portfolio value</CardTitle>
            <Tabs value={range} onValueChange={setRange}>
              <TabsList aria-label="Chart range">
                {RANGES.map((r) => (
                  <TabsTrigger key={r} value={r} className="text-xs uppercase">
                    {r}
                  </TabsTrigger>
                ))}
              </TabsList>
              {/* Filter-style tabs: empty panels keep aria-controls targets valid (§19). */}
              {RANGES.map((r) => (
                <TabsContent key={r} value={r} className="hidden" />
              ))}
            </Tabs>
          </CardHeader>
          <CardContent>
            <ValueAreaChart series={d?.series ?? []} />
          </CardContent>
        </Card>

        {/* Zone 3: allocation donut, 4-col — drill-in → evidence drawer */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationDonut
              positions={snapshot?.positions ?? []}
              cashValue={snapshot?.cashValue ?? null}
              onDrill={(query) => setDrawer({ kind: "filter", query })}
            />
          </CardContent>
        </Card>

        {/* Zone 4: top holdings, 6-col */}
        <Card className="col-span-6">
          <CardHeader>
            <CardTitle>Top holdings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(snapshot?.positions ?? [])
              .filter((p) => Number(p.marketValue) > 0)
              .sort((a, b) => Number(b.marketValue) - Number(a.marketValue))
              .slice(0, 8)
              .map((p) => (
                <button
                  key={p.instrumentId}
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  onClick={() => setDrawer({ kind: "filter", query: `types=buy,sell&q=&limit=100` })}
                  aria-label={`Holding, opens evidence drawer`}
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {p.instrumentId.slice(0, 8)}
                  </span>
                  <span className="flex items-center gap-2">
                    {p.flags.includes("incomplete_history") && (
                      <Badge variant="muted">incomplete history</Badge>
                    )}
                    <MoneyText value={p.marketValue} currency={p.currency} />
                  </span>
                </button>
              ))}
            {(snapshot?.positions ?? []).length === 0 && (
              <EmptyState
                variant="degraded"
                title="No holdings"
                description="Positions appear after importing brokerage activity."
              />
            )}
          </CardContent>
        </Card>

        {/* Zone 5: open anomalies (top 5 by severity), 6-col */}
        <Card className="col-span-6" data-testid="open-anomalies">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Open anomalies</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/anomalies">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {(d?.openAnomalies ?? []).map((a) => (
              <Link
                key={a.id}
                href="/app/anomalies"
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <span className="truncate">{a.title}</span>
                <SeverityBadge severity={a.severity} />
              </Link>
            ))}
            {(d?.openAnomalies ?? []).length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Queue clear. Detectors run after every import.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Zone 6 (§05.4): recent imports strip */}
      {(d?.recentImports ?? []).length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm" data-testid="recent-imports">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Recent imports</span>
          {(d?.recentImports ?? []).map((b) => (
            <Link
              key={b.id}
              href={`/app/imports/${b.id}`}
              className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 hover:bg-muted"
            >
              <span className="max-w-40 truncate font-mono text-xs">{b.fileName ?? "import"}</span>
              <Badge variant="muted">{b.status}</Badge>
              {typeof b.stats?.accepted === "number" && (
                <span className="text-xs text-muted-foreground">{b.stats.accepted} rows</span>
              )}
            </Link>
          ))}
        </div>
      )}

      <EvidenceDrawer
        descriptor={drawer}
        open={drawer !== null}
        onOpenChange={(open) => !open && setDrawer(null)}
      />
    </>
  );
}

function StatCard({
  label,
  value,
  delta,
  directional = false,
  onClick,
}: {
  label: string;
  value: string | null;
  /** §13.2 flow-adjusted change for the period — "change excl. contributions". */
  delta?: string | null;
  directional?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card className="col-span-3">
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-lg text-left"
        aria-label={`${label}: ${value ?? "no data"}. Opens evidence drawer.`}
      >
        <CardHeader className="pb-2">
          <CardTitle>{label}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold">
            <MoneyText value={value} showDirection={directional} compact={Math.abs(Number(value ?? 0)) >= 10_000_000} />
          </div>
          {delta != null && (
            <p className="mt-1 text-xs text-muted-foreground">
              <MoneyText value={delta} showDirection /> excl. contributions
            </p>
          )}
        </CardContent>
      </button>
    </Card>
  );
}
