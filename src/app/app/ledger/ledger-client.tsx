"use client";

import Link from "next/link";
import * as React from "react";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { m } from "framer-motion";
import { z } from "zod";

import { EmptyState } from "@/components/app/empty-state";
import { MoneyText } from "@/components/app/money-text";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api/fetch";
import { qk } from "@/lib/api/keys";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import { MOTION } from "@/lib/constants/motion";
import { useMotionSafe } from "@/lib/hooks/use-motion-safe";

/** URL filter schema — §06.6: same Zod family the API accepts. */
const LedgerFilterSchema = z.object({
  account: z.string().optional().catch(undefined),
  batch: z.string().optional().catch(undefined),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  types: z.string().optional().catch(undefined),
  min: z.string().optional().catch(undefined),
  max: z.string().optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  sort: z.enum(["date", "amount"]).default("date").catch("date"),
  dir: z.enum(["asc", "desc"]).default("desc").catch("desc"),
});

type WireTx = {
  id: string;
  accountId: string;
  batchId: string;
  date: string;
  type: string;
  amount: string;
  currency: string;
  symbol: string | null;
  quantity: string | null;
  price: string | null;
  description: string;
  sourceLine: number | null;
  supersedesId: string | null;
  superseded: boolean;
};

type WireAccount = { id: string; name: string; archivedAt: string | null };

const TYPE_OPTIONS = [
  "buy", "sell", "dividend", "interest", "deposit", "withdrawal", "fee",
  "transfer_in", "transfer_out", "other",
];

export function LedgerClient() {
  type LedgerFilters = z.infer<typeof LedgerFilterSchema>;
  const { filters, set, setDebounced, clear } = useUrlFilters<LedgerFilters>(LedgerFilterSchema);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [searchDraft, setSearchDraft] = React.useState(filters.q ?? "");
  const motionSafe = useMotionSafe();

  const { data: accounts } = useQuery({
    queryKey: qk.accounts(true),
    queryFn: () => apiFetch<WireAccount[]>("/accounts?includeArchived=true"),
    staleTime: 5 * 60_000,
  });

  const queryString = React.useMemo(() => {
    const params = new URLSearchParams();
    if (filters.account) params.set("accountIds", filters.account);
    if (filters.batch) params.set("batchId", filters.batch);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.types) params.set("types", filters.types);
    if (filters.min) params.set("minAmount", filters.min);
    if (filters.max) params.set("maxAmount", filters.max);
    if (filters.q) params.set("q", filters.q);
    params.set("sort", filters.sort);
    params.set("dir", filters.dir);
    params.set("limit", "50");
    return params.toString();
  }, [filters]);

  const query = useInfiniteQuery({
    queryKey: qk.transactions({ ...filters }),
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam ? `&cursor=${pageParam}` : "";
      return apiFetch<WireTx[]>(`/transactions?${queryString}${cursor}`);
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.meta?.cursor ?? undefined,
    staleTime: 30_000, // §20.6 transactions pages
    placeholderData: keepPreviousData, // §20.6: filtered lists keep prior rows
  });
  // §05.5 count is a separate, non-blocking request (§20.2 budget covers rows).
  const { data: countData } = useQuery({
    queryKey: qk.transactions({ ...filters, countOnly: true }),
    queryFn: () => apiFetch<never[]>(`/transactions?${queryString}&countOnly=1`),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const total = countData?.meta?.total;

  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
  const activeChips = [
    filters.account && { key: "account", label: accountLabel(filters.account) },
    filters.from && { key: "from", label: `from ${filters.from}` },
    filters.to && { key: "to", label: `to ${filters.to}` },
    filters.types && { key: "types", label: filters.types },
    filters.min && { key: "min", label: `≥ ${filters.min}` },
    filters.max && { key: "max", label: `≤ ${filters.max}` },
    filters.q && { key: "q", label: `"${filters.q}"` },
    filters.batch && { key: "batch", label: `batch ${filters.batch.slice(0, 14)}…` },
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  function accountLabel(id: string): string {
    const account = accounts?.data.find((a) => a.id === id);
    if (!account) return "account";
    return account.archivedAt ? `${account.name} (archived)` : account.name;
  }

  const minMaxSwapped =
    filters.min && filters.max && Number(filters.min) > Number(filters.max);

  return (
    <>
      <PageHeader title="Ledger" />

      {/* FilterBar — §03.6.1 */}
      <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="filter-bar">
        <Select
          value={filters.account ?? "all"}
          onValueChange={(v) => set({ account: v === "all" ? undefined : v }, { history: true })}
        >
          <SelectTrigger className="w-48" aria-label="Filter by account">
            <SelectValue placeholder="All accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {(accounts?.data ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
                {a.archivedAt ? " (archived)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.types ?? "all"}
          onValueChange={(v) => set({ types: v === "all" ? undefined : v }, { history: true })}
        >
          <SelectTrigger className="w-40" aria-label="Filter by type">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TYPE_OPTIONS.map((t) => (
              <SelectItem key={t} value={t}>
                {t.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          className="w-40"
          aria-label="From date"
          value={filters.from ?? ""}
          onChange={(e) => set({ from: e.target.value || undefined })}
        />
        <Input
          type="date"
          className="w-40"
          aria-label="To date"
          value={filters.to ?? ""}
          onChange={(e) => set({ to: e.target.value || undefined })}
        />
        <Input
          className="w-56"
          placeholder="Search descriptions…"
          aria-label="Search descriptions"
          value={searchDraft}
          onChange={(e) => {
            setSearchDraft(e.target.value);
            setDebounced({ q: e.target.value || undefined });
          }}
        />
        {activeChips.length >= 2 && (
          <Button variant="ghost" size="sm" onClick={() => { clear(); setSearchDraft(""); }}>
            Clear all
          </Button>
        )}
      </div>

      {activeChips.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {activeChips.map((chip) => (
            <Badge key={chip.key} variant="secondary" className="gap-1">
              {chip.label}
              <button
                type="button"
                aria-label={`Remove filter ${chip.label}`}
                onClick={() => {
                  set({ [chip.key]: undefined }, { history: true });
                  if (chip.key === "q") setSearchDraft("");
                }}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}

      {minMaxSwapped && (
        <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">
          Minimum is larger than maximum —{" "}
          <button
            type="button"
            className="underline"
            onClick={() => set({ min: filters.max, max: filters.min })}
          >
            swap them?
          </button>
        </div>
      )}

      {query.isLoading ? (
        <div className="space-y-1" data-testid="ledger-skeleton">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        activeChips.length > 0 ? (
          <EmptyState
            variant="filtered-empty"
            title="No matches"
            action={
              <Button variant="outline" onClick={() => { clear(); setSearchDraft(""); }}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            variant="true-empty"
            title="No transactions yet"
            description="Import a CSV to build your ledger."
            action={
              <Button asChild>
                <Link href="/app/imports/new">Import transactions</Link>
              </Button>
            }
          />
        )
      ) : (
        <>
          {/* §03.6.1/§05.5: exact count below 10k, "10,000+" above. */}
          <p className="mb-2 text-xs text-muted-foreground" aria-live="polite" data-testid="ledger-total">
            {total === undefined
              ? ""
              : total === "10000+"
                ? "10,000+ transactions match"
                : `${Number(total).toLocaleString("en-US")} transaction${Number(total) === 1 ? "" : "s"} match`}
          </p>
          <Table data-testid="ledger-table">
            <TableHeader>
              <TableRow>
                <TableHead aria-sort={filters.sort === "date" ? (filters.dir === "desc" ? "descending" : "ascending") : "none"}>
                  <SortButton label="Date" col="date" filters={filters} set={set} />
                </TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Instrument</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right" aria-sort={filters.sort === "amount" ? (filters.dir === "desc" ? "descending" : "ascending") : "none"}>
                  <SortButton label="Amount" col="amount" filters={filters} set={set} />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((tx) => (
                <React.Fragment key={tx.id}>
                  <TableRow
                    className="h-11 cursor-pointer"
                    data-superseded={tx.superseded || undefined}
                    onClick={() => setExpanded(expanded === tx.id ? null : tx.id)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setExpanded(expanded === tx.id ? null : tx.id);
                    }}
                    // aria-expanded is not valid on role=row outside a treegrid
                    // (§19 axe gate); the revealed detail row conveys the state.
                    data-expanded={expanded === tx.id || undefined}
                  >
                    <TableCell className="whitespace-nowrap font-mono text-xs">{tx.date}</TableCell>
                    <TableCell>
                      <Badge variant="muted">{tx.type.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate" title={tx.description}>
                      {tx.description || <span className="text-muted-foreground">—</span>}
                      {tx.superseded && (
                        <Badge variant="outline" className="ml-1.5 text-muted-foreground">
                          superseded
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{tx.symbol ?? ""}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {tx.quantity ? Number(tx.quantity).toLocaleString("en-US") : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      {tx.price ? <MoneyText value={tx.price} currency={tx.currency} /> : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyText value={tx.amount} currency={tx.currency} showDirection />
                    </TableCell>
                  </TableRow>
                  {expanded === tx.id && (
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={7}>
                        {/* §03.8.2 row expansion: height/opacity ease-in, honoring reduced motion. */}
                        <m.div
                          initial={motionSafe ? { opacity: 0, height: 0 } : false}
                          animate={{ opacity: 1, height: "auto" }}
                          transition={{ duration: MOTION.duration.base, ease: MOTION.ease.standard }}
                          className="grid grid-cols-3 gap-3 overflow-hidden p-2 text-xs"
                          data-testid="row-expansion">
                          <div>
                            <p className="font-medium text-muted-foreground">Lineage</p>
                            <p>
                              Batch:{" "}
                              <Link className="text-primary underline" href={`/app/imports/${tx.batchId}`}>
                                {tx.batchId.slice(0, 14)}…
                              </Link>
                            </p>
                            <p>Source line: {tx.sourceLine ?? "—"}</p>
                          </div>
                          <div>
                            <p className="font-medium text-muted-foreground">Supersede chain</p>
                            <p>{tx.supersedesId ? `Corrects ${tx.supersedesId.slice(0, 14)}…` : "Original row"}</p>
                            <p>{tx.superseded ? "Superseded by a correction" : "Head row"}</p>
                          </div>
                          <div>
                            <p className="font-medium text-muted-foreground">Full description</p>
                            <p className="break-words">{tx.description || "—"}</p>
                          </div>
                        </m.div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
          {query.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {query.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function SortButton({
  label,
  col,
  filters,
  set,
}: {
  label: string;
  col: "date" | "amount";
  filters: { sort: string; dir: string };
  set: (patch: Record<string, unknown>, opts?: { history?: boolean }) => void;
}) {
  const active = filters.sort === col;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 uppercase"
      onClick={(e) => {
        e.stopPropagation();
        // §03.6.1 tri-state: desc → asc → none (falls back to the date default),
        // and sorting scrolls back to the top of the results.
        if (!active) set({ sort: col, dir: "desc" }, { history: true });
        else if (filters.dir === "desc") set({ sort: col, dir: "asc" }, { history: true });
        else set({ sort: undefined, dir: undefined }, { history: true });
        window.scrollTo({ top: 0 });
      }}
      aria-label={`Sort by ${label}, currently ${active ? filters.dir : "unsorted"}`}
    >
      {label}
      {active && <span aria-hidden>{filters.dir === "desc" ? "↓" : "↑"}</span>}
    </button>
  );
}
