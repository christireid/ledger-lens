"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api/fetch";
import { qk } from "@/lib/api/keys";

// S-09 — §05.9: batch table.

type WireBatch = {
  id: string;
  fileName: string | null;
  status: string;
  stats: { accepted?: number; rejected?: number; duplicates?: number } | null;
  createdAt: string;
};

export default function ImportsPage() {
  const { data, isLoading } = useQuery({
    queryKey: qk.imports(),
    queryFn: () => apiFetch<WireBatch[]>("/imports"),
    staleTime: 30_000,
  });
  const batches = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Imports"
        actions={
          <Button asChild data-testid="new-import">
            <Link href="/app/imports/new">New import</Link>
          </Button>
        }
      />
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : batches.length === 0 ? (
        <EmptyState
          variant="true-empty"
          title="Nothing imported yet"
          description="Upload a CSV export from your broker or bank to get started."
          action={
            <Button asChild>
              <Link href="/app/imports/new">Import transactions</Link>
            </Button>
          }
        />
      ) : (
        <Table data-testid="batch-table">
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Accepted</TableHead>
              <TableHead className="text-right">Rejected</TableHead>
              <TableHead className="text-right">Duplicates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="max-w-[240px] truncate font-medium">{b.fileName ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(b.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">{b.stats?.accepted ?? "—"}</TableCell>
                <TableCell className="text-right font-mono text-xs">{b.stats?.rejected ?? "—"}</TableCell>
                <TableCell className="text-right font-mono text-xs">{b.stats?.duplicates ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={b.status === "committed" ? "default" : b.status === "failed" ? "outline" : "muted"}>
                    {b.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/app/imports/${b.id}`}>Detail</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
