"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api/fetch";
import { qk } from "@/lib/api/keys";

// S-11 — §05.9: batch metadata, lineage, rejects download.

type WireBatch = {
  id: string;
  fileName: string | null;
  status: string;
  stats: { accepted?: number; rejected?: number; duplicates?: number } | null;
  error: string | null;
  createdAt: string;
};

export function BatchDetailClient({ batchId }: { batchId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: qk.importBatch(batchId),
    queryFn: () => apiFetch<WireBatch>(`/imports/${batchId}`),
  });
  const batch = data?.data;

  if (isLoading || !batch) return <Skeleton className="h-64 w-full" />;

  return (
    <>
      <PageHeader
        title={batch.fileName ?? "Import batch"}
        actions={
          <Badge variant={batch.status === "committed" ? "default" : "muted"}>{batch.status}</Badge>
        }
      />
      <div className="grid grid-cols-12 gap-6">
        <Card className="col-span-6">
          <CardHeader>
            <CardTitle>Batch stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Accepted: <strong data-testid="stat-accepted">{batch.stats?.accepted ?? 0}</strong></p>
            <p>Rejected: <strong data-testid="stat-rejected">{batch.stats?.rejected ?? 0}</strong></p>
            <p>Duplicates skipped: <strong>{batch.stats?.duplicates ?? 0}</strong></p>
            <p className="text-xs text-muted-foreground">
              Imported {new Date(batch.createdAt).toLocaleString("en-US")}
            </p>
            {batch.error && <p className="text-destructive">{batch.error}</p>}
          </CardContent>
        </Card>
        <Card className="col-span-6">
          <CardHeader>
            <CardTitle>Lineage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Every accepted row keeps its source line number. Post-commit the batch is immutable —
              corrections supersede rows, never delete them.
            </p>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/app/ledger`}>View accepted rows in Ledger</Link>
              </Button>
              {(batch.stats?.rejected ?? 0) > 0 && (
                <Button asChild size="sm" variant="outline">
                  <a href={`/api/imports/${batch.id}/rejects.csv`} download data-testid="download-rejects">
                    Download rejected rows (CSV)
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
