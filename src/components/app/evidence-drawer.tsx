"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { MoneyText } from "@/components/app/money-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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

/**
 * EvidenceDrawer — §03.6.4 contract: receives {ids} | {filter}, renders the
 * standard table compact, offers "Open in Ledger", closes via Esc/scrim/button.
 * Never stacks more than one deep. Focus restored to invoker by Radix.
 */

export type EvidenceDescriptor =
  | { kind: "ids"; ids: string[] }
  | { kind: "filter"; query: string };

type WireTx = {
  id: string;
  date: string;
  type: string;
  description: string;
  amount: string;
  currency: string;
  symbol: string | null;
  superseded: boolean;
};

export function EvidenceDrawer({
  descriptor,
  open,
  onOpenChange,
}: {
  descriptor: EvidenceDescriptor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: qk.transactions({ evidence: JSON.stringify(descriptor) }),
    queryFn: async () => {
      if (!descriptor) return { data: [] as WireTx[] };
      if (descriptor.kind === "filter") {
        return apiFetch<WireTx[]>(`/transactions?${descriptor.query}`);
      }
      // ID-set: fetch individually (≤100 per §14.2 cap) — small sets, parallel.
      const rows = await Promise.all(
        descriptor.ids.slice(0, 100).map(async (id) => {
          try {
            const res = await apiFetch<WireTx>(`/transactions/${id}`);
            return res.data;
          } catch {
            return null; // superseded/archived evidence renders what it can (§05.7)
          }
        }),
      );
      return { data: rows.filter((r): r is WireTx => r !== null) };
    },
    enabled: open && descriptor !== null,
  });

  const ledgerHref =
    descriptor?.kind === "filter" ? `/app/ledger?${descriptor.query}` : "/app/ledger";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-testid="evidence-drawer">
        <SheetHeader>
          <SheetTitle>
            Evidence{data?.data ? ` · ${data.data.length} transactions` : ""}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.data ?? []).map((tx) => (
                  <TableRow key={tx.id} className="h-8">
                    <TableCell className="whitespace-nowrap font-mono text-xs">{tx.date}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs" title={tx.description}>
                      {tx.description || tx.type}
                      {tx.superseded && (
                        <Badge variant="muted" className="ml-1">
                          superseded
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      <MoneyText value={tx.amount} currency={tx.currency} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <div className="border-t p-3">
          <Button asChild variant="outline" size="sm">
            <Link href={ledgerHref}>Open in Ledger</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
