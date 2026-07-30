"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";

/** FreshnessIndicator — §04.6: fresh / stale (>26h, §03.5) / recomputing. */
export function FreshnessIndicator({
  computedAt,
  recomputing = false,
}: {
  computedAt: string | null;
  recomputing?: boolean;
}) {
  const state = recomputing
    ? "recomputing"
    : !computedAt
      ? "none"
      : Date.now() - Date.parse(computedAt) > 26 * 3600_000
        ? "stale"
        : "fresh";
  const label =
    state === "recomputing"
      ? "Recomputing…"
      : state === "none"
        ? "No snapshot yet"
        : `Data as of ${new Date(computedAt!).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          aria-label={`Snapshot freshness: ${state}. ${label}`}
          data-testid="freshness-indicator"
        >
          <span
            aria-hidden
            className={cn(
              "h-2 w-2 rounded-full",
              state === "fresh" && "bg-gain",
              state === "stale" && "bg-warning",
              state === "recomputing" && "animate-pulse bg-info",
              state === "none" && "bg-muted-foreground",
            )}
          />
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {state === "stale"
          ? "This snapshot is older than 26 hours. It recomputes nightly and after imports."
          : "Snapshots recompute nightly and after every import."}
      </TooltipContent>
    </Tooltip>
  );
}
