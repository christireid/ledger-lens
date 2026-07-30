"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { EmptyState } from "@/components/app/empty-state";
import { EvidenceDrawer, type EvidenceDescriptor } from "@/components/app/evidence-drawer";
import { PageHeader } from "@/components/app/page-header";
import { SeverityBadge } from "@/components/app/severity-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api/fetch";
import { qk } from "@/lib/api/keys";
import { useAppMutation } from "@/lib/api/mutations";

// S-05 Anomalies — §05.6: triage queue; optimistic triage w/ 10 s undo (§03.5).

type WireAnomaly = {
  id: string;
  type: string;
  severity: string;
  status: string;
  title: string;
  explanation: string | null;
  evidenceTxIds: string[];
  statusChangedAt: string | null;
  createdAt: string;
};

const STATUSES = ["open", "acknowledged", "dismissed"] as const;

export default function AnomaliesPage() {
  const [status, setStatus] = React.useState<string>("open");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [drawer, setDrawer] = React.useState<EvidenceDescriptor | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: qk.anomalies(status),
    queryFn: () => apiFetch<WireAnomaly[]>(`/anomalies?status=${status}`),
    staleTime: 30_000,
  });

  const setStatusMutation = useAppMutation({
    mutationFn: ({ id, next }: { id: string; next: string }) =>
      apiFetch(`/anomalies/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: next }),
      }),
    invalidate: [["anomalies"], ["dashboard"]],
  });

  const bulkAcknowledge = useAppMutation({
    mutationFn: (ids: string[]) =>
      apiFetch(`/anomalies/bulk-status`, {
        method: "POST",
        body: JSON.stringify({ ids, status: "acknowledged" }),
      }),
    invalidate: [["anomalies"], ["dashboard"]],
    onSuccess: () => setSelected(new Set()),
  });

  // §03.5: optimistic triage with 10 s undo — apply, show UndoToast, revert on undo.
  function triage(anomaly: WireAnomaly, next: "acknowledged" | "dismissed") {
    const previous = anomaly.status;
    qc.setQueryData(qk.anomalies(status), (old: { data: WireAnomaly[] } | undefined) =>
      old ? { ...old, data: old.data.filter((a) => a.id !== anomaly.id) } : old,
    );
    let undone = false;
    // §19.3 undo toast: the countdown rides the toast's own timer, which
    // sonner pauses on hover/focus — commit happens on real auto-close.
    toast(`${next === "acknowledged" ? "Acknowledged" : "Dismissed"} "${anomaly.title}"`, {
      duration: 10_000,
      onAutoClose: () => {
        if (!undone) setStatusMutation.mutate({ id: anomaly.id, next });
      },
      action: {
        label: "Undo",
        onClick: () => {
          undone = true;
          void qc.invalidateQueries({ queryKey: qk.anomalies(status).slice(0, 1) });
          void previous;
        },
      },
    });
  }

  const anomalies = data?.data ?? [];

  return (
    <>
      <PageHeader title="Anomalies" />
      <div className="mb-4 flex items-center justify-between">
        <Tabs value={status} onValueChange={(v) => { setStatus(v); setSelected(new Set()); }}>
          <TabsList aria-label="Anomaly status">
            {STATUSES.map((s) => (
              <TabsTrigger key={s} value={s} className="capitalize" data-testid={`tab-${s}`}>
                {s}
                {s === status && !isLoading ? ` (${anomalies.length})` : ""}
              </TabsTrigger>
            ))}
          </TabsList>
          {/* Filter-style tabs: empty panels keep aria-controls targets valid (§19). */}
          {STATUSES.map((s) => (
            <TabsContent key={s} value={s} className="hidden" />
          ))}
        </Tabs>
        {selected.size > 0 && status === "open" && (
          <Button
            size="sm"
            onClick={() => bulkAcknowledge.mutate([...selected])}
            disabled={bulkAcknowledge.isPending}
          >
            Acknowledge {selected.size} selected
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : anomalies.length === 0 ? (
        <EmptyState
          variant={status === "open" ? "true-empty" : "filtered-empty"}
          title={status === "open" ? "Queue clear." : `No ${status} anomalies`}
          description={status === "open" ? "Detectors run after every import." : undefined}
        />
      ) : (
        <div className="space-y-3" data-testid="anomaly-list">
          {anomalies.map((a) => (
            <Card key={a.id} data-testid="anomaly-card">
              <CardContent className="flex items-start gap-3 p-4">
                {status === "open" && (
                  <Checkbox
                    className="mt-1"
                    checked={selected.has(a.id)}
                    onCheckedChange={(checked) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(a.id);
                        else next.delete(a.id);
                        return next;
                      });
                    }}
                    aria-label={`Select ${a.title}`}
                  />
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={a.severity} />
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {a.type.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(a.createdAt).toLocaleDateString("en-US")}
                    </span>
                  </div>
                  <p className="font-medium">{a.title}</p>
                  {a.explanation && (
                    <p className="text-sm text-muted-foreground">{a.explanation}</p>
                  )}
                  {a.evidenceTxIds.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-primary underline underline-offset-4"
                      onClick={() => setDrawer({ kind: "ids", ids: a.evidenceTxIds })}
                      aria-label={`Evidence: ${a.evidenceTxIds.length} transactions, opens drawer`}
                      data-testid="evidence-chip"
                    >
                      [{a.evidenceTxIds.length} txns]
                    </button>
                  )}
                </div>
                {status === "open" && (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" onClick={() => triage(a, "acknowledged")}>
                      Acknowledge
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => triage(a, "dismissed")}>
                      Dismiss
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
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
