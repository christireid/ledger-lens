"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/app/empty-state";
import { useMotionSafe } from "@/lib/hooks/use-motion-safe";

/**
 * Dashboard charts — §04.7: series colors from --chart-*; shared tooltip;
 * draw-in 320 ms once per mount, disabled under reduced motion; sr-only
 * summary sentence + charts with <2 points render EmptyState degraded.
 */

function cssVar(name: string): string {
  return `hsl(var(${name}))`;
}

function SharedTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number | string; name?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-card px-3 py-2 shadow-md">
      <p className="text-xs text-muted-foreground">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="font-mono text-sm">
          {typeof entry.value === "number"
            ? entry.value.toLocaleString("en-US", { style: "currency", currency: "USD" })
            : entry.value}
        </p>
      ))}
    </div>
  );
}

export function ValueAreaChart({
  series,
}: {
  series: Array<{ asOf: string; totalValue: string | null }>;
}) {
  const motionSafe = useMotionSafe();
  // §13.4-2: null points are snapshot gaps — kept so the area renders a
  // visual break (connectNulls=false), never a fabricated line.
  const points = series.map((p) => ({
    asOf: p.asOf,
    value: p.totalValue === null ? null : Number(p.totalValue),
  }));
  const priced = points.filter((p): p is { asOf: string; value: number } => p.value !== null);

  if (priced.length < 2) {
    return (
      <EmptyState
        variant="degraded"
        title="Not enough history to chart"
        description="The value series appears after your first snapshots compute."
      />
    );
  }

  const low = Math.min(...priced.map((p) => p.value));
  const high = Math.max(...priced.map((p) => p.value));
  const summary = `Portfolio value from ${priced[0]!.asOf} to ${priced.at(-1)!.asOf}, low ${low.toLocaleString("en-US", { style: "currency", currency: "USD" })}, high ${high.toLocaleString("en-US", { style: "currency", currency: "USD" })}, ending ${priced.at(-1)!.value.toLocaleString("en-US", { style: "currency", currency: "USD" })}.`;

  return (
    <figure>
      {/* §19.3: the drawn chart is a single image to AT; the data lives in the table below. */}
      <div className="h-64 w-full" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <XAxis
              dataKey="asOf"
              tick={{ fontSize: 11, fill: cssVar("--muted-foreground") }}
              tickLine={false}
              axisLine={{ stroke: cssVar("--border"), opacity: 0.5 }}
              minTickGap={48}
            />
            <YAxis
              tick={{ fontSize: 11, fill: cssVar("--muted-foreground") }}
              tickLine={false}
              axisLine={false}
              width={72}
              tickFormatter={(v: number) =>
                v.toLocaleString("en-US", { style: "currency", currency: "USD", notation: "compact" })
              }
            />
            <Tooltip content={<SharedTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              connectNulls={false}
              stroke={cssVar("--chart-1")}
              fill={cssVar("--chart-1")}
              fillOpacity={0.12}
              strokeWidth={2}
              isAnimationActive={motionSafe}
              animationDuration={320}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {/* §04.7/§19: visually hidden data table */}
      <table className="sr-only">
        <caption>Portfolio value by date</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.asOf}>
              <td>{p.asOf}</td>
              <td>{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

const KIND_COLORS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5", "--chart-6"];

export function AllocationDonut({
  positions,
  cashValue,
  onDrill,
}: {
  positions: Array<{ instrumentId: string; marketValue: string; currency: string }>;
  cashValue: string | null;
  onDrill: (query: string) => void;
}) {
  const motionSafe = useMotionSafe();
  const equity = positions.reduce((acc, p) => acc + Math.max(0, Number(p.marketValue)), 0);
  const cash = Math.max(0, Number(cashValue ?? 0));
  const slices = [
    { name: "Holdings", value: equity, query: "types=buy,sell&limit=100" },
    { name: "Cash", value: cash, query: "types=deposit,withdrawal,transfer_in,transfer_out&limit=100" },
  ].filter((s) => s.value > 0);

  if (slices.length === 0) {
    return (
      <EmptyState
        variant="degraded"
        title="Nothing to allocate yet"
        description="Allocation appears after your first import."
      />
    );
  }
  const total = slices.reduce((a, s) => a + s.value, 0);
  const summary = `Allocation: ${slices
    .map((s) => `${s.name} ${((s.value / total) * 100).toFixed(0)}%`)
    .join(", ")}.`;

  return (
    <figure>
      <div className="h-56 w-full" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<SharedTooltip />} />
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="60%"
              outerRadius="85%"
              isAnimationActive={motionSafe}
              animationDuration={320}
            >
              {slices.map((s, i) => (
                <Cell
                  key={s.name}
                  fill={cssVar(KIND_COLORS[i % KIND_COLORS.length]!)}
                  onClick={() => onDrill(s.query)}
                  className="cursor-pointer"
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-3">
        {slices.map((s, i) => (
          <button
            key={s.name}
            type="button"
            onClick={() => onDrill(s.query)}
            className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs hover:bg-muted"
            aria-label={`${s.name}, ${((s.value / total) * 100).toFixed(0)} percent, opens evidence drawer`}
          >
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: cssVar(KIND_COLORS[i % KIND_COLORS.length]!) }}
            />
            {s.name} {((s.value / total) * 100).toFixed(0)}%
          </button>
        ))}
      </div>
    </figure>
  );
}
