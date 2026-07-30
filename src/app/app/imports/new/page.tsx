"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, ApiError } from "@/lib/api/fetch";
import { qk } from "@/lib/api/keys";
import { invalidateAfterImportCommit } from "@/lib/api/mutations";

/**
 * S-10 Import wizard — §03.6.2/§05.9: Upload → Map → Preview & validate →
 * Confirm. Linear, no skip; back never loses state; commit atomic.
 */

type Step = "upload" | "map" | "preview" | "confirm";
const STEPS: Array<{ key: Step; label: string }> = [
  { key: "upload", label: "Upload" },
  { key: "map", label: "Map columns" },
  { key: "preview", label: "Preview & validate" },
  { key: "confirm", label: "Confirm" },
];

const TARGET_FIELDS = [
  { key: "date", label: "Date", required: true },
  { key: "amount", label: "Amount", required: true },
  { key: "description", label: "Description", required: true },
  { key: "type", label: "Type", required: false },
  { key: "instrument_symbol", label: "Symbol", required: false },
  { key: "quantity", label: "Quantity", required: false },
  { key: "price", label: "Price", required: false },
  { key: "currency", label: "Currency", required: false },
] as const;

type Draft = {
  id: string;
  headers: string[];
  sampleRows: string[][];
  rowCount: number;
  suggestedMapping: Record<string, number>;
};

type DryRun = {
  accepted: number;
  rejected: Array<{ line: number; field: string; code: string; message: string }>;
  intraFileDuplicates: number[];
  crossBatchDupes: number;
  typeTally: Record<string, number>;
  euLocaleColumns?: string[];
};

type WireAccount = { id: string; name: string; archivedAt: string | null };

export default function ImportWizardPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = React.useState<Step>("upload");
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [mapping, setMapping] = React.useState<Record<string, number>>({});
  const [dryRun, setDryRun] = React.useState<DryRun | null>(null);
  const { data: workspace } = useQuery({
    queryKey: qk.workspace(),
    queryFn: () => apiFetch<{ id: string; name: string; isDemo: boolean }>("/workspace"),
    staleTime: 5 * 60_000,
  });
  const [accountId, setAccountId] = React.useState<string>("");
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [crossDupeDecision, setCrossDupeDecision] = React.useState<"skip" | "import">("skip");
  const commitKey = React.useRef<string>(crypto.randomUUID());

  const { data: accounts } = useQuery({
    queryKey: qk.accounts(false),
    queryFn: () => apiFetch<WireAccount[]>("/accounts"),
  });

  async function upload(file: File) {
    setUploadError(null);
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("That file is over the 10 MB limit.");
      return;
    }
    if (file.size === 0) {
      setUploadError("That file is empty.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch<Draft>("/imports", { method: "POST", body: form });
      setDraft(res.data);
      setMapping(res.data.suggestedMapping);
      setStep("map");
    } catch (err) {
      if (err instanceof ApiError && err.code === "duplicate_file") {
        setUploadError("This exact file was already imported — see the original batch in Imports.");
      } else {
        setUploadError(err instanceof Error ? err.message : "Upload failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmMapping() {
    if (!draft) return;
    setBusy(true);
    try {
      await apiFetch(`/imports/${draft.id}/mapping`, {
        method: "PATCH",
        body: JSON.stringify({ mapping }),
      });
      const res = await apiFetch<DryRun>(`/imports/${draft.id}/validate`, { method: "POST" });
      setDryRun(res.data);
      setStep("preview");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Validation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!draft || !accountId) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ id: string }>(`/imports/${draft.id}/commit`, {
        method: "POST",
        headers: { "Idempotency-Key": commitKey.current },
        body: JSON.stringify({ accountId, crossDupeDecision }),
      });
      await invalidateAfterImportCommit(qc);
      toast.success("Import committed — snapshot recomputing.");
      router.push(`/app/imports/${res.data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Commit failed.");
      setBusy(false);
    }
  }

  const requiredMapped = TARGET_FIELDS.filter((f) => f.required).every(
    (f) => mapping[f.key] !== undefined,
  );
  const allRejected = dryRun !== null && dryRun.accepted === 0;

  return (
    <>
      <PageHeader title="Import transactions" />

      {/* Stepper — §04.6 ImportStepper: linear, no skip */}
      {/* §19.3 wizard stepper: step transitions announce via a polite live region. */}
      <p aria-live="polite" className="sr-only">
        {`Step ${STEPS.findIndex((x) => x.key === step) + 1} of ${STEPS.length}: ${STEPS.find((x) => x.key === step)?.label ?? ""}`}
      </p>
      <ol className="mb-6 flex items-center gap-2" aria-label="Import steps">
        {STEPS.map((s, i) => {
          const stateIndex = STEPS.findIndex((x) => x.key === step);
          const done = i < stateIndex;
          const active = s.key === step;
          return (
            <li key={s.key} className="flex items-center gap-2">
              <span
                className={
                  active
                    ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground"
                    : done
                      ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs text-primary"
                      : "flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground"
                }
                aria-current={active ? "step" : undefined}
              >
                {i + 1}
              </span>
              <span className={active ? "text-sm font-medium" : "text-sm text-muted-foreground"}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="text-muted-foreground">→</span>}
            </li>
          );
        })}
      </ol>

      {step === "upload" && workspace?.data.isDemo && (
        <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm" data-testid="demo-collision">
          {/* §02.8-10: importing real data into a demo workspace */}
          This workspace holds demo data. Imported rows will sit alongside it —
          clear the demo first in{" "}
          <Link href="/app/settings?tab=workspace" className="underline underline-offset-4">
            Settings → Demo data
          </Link>{" "}
          if you want a clean start.
        </div>
      )}
      {step === "upload" && (
        <Card>
          <CardContent className="p-8">
            <label
              className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center hover:bg-muted/40"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) void upload(file);
              }}
            >
              <p className="font-medium">Drop a CSV here, or click to choose</p>
              <p className="text-sm text-muted-foreground">
                .csv or .txt · up to 10 MB · 50,000 rows
              </p>
              <Input
                type="file"
                accept=".csv,.txt"
                className="hidden"
                data-testid="file-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              {busy && <p className="text-sm text-muted-foreground">Parsing…</p>}
              {uploadError && (
                <p className="text-sm text-destructive" data-testid="upload-error">
                  {uploadError}
                </p>
              )}
            </label>
          </CardContent>
        </Card>
      )}

      {step === "map" && draft && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {TARGET_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1">
                <label className="text-xs font-medium">
                  {field.label}
                  {field.required && <span className="text-destructive"> *</span>}
                </label>
                <Select
                  value={mapping[field.key] !== undefined ? String(mapping[field.key]) : "none"}
                  onValueChange={(v) =>
                    setMapping((m) => {
                      const next = { ...m };
                      if (v === "none") delete next[field.key];
                      else next[field.key] = Number(v);
                      return next;
                    })
                  }
                >
                  <SelectTrigger aria-label={`Map ${field.label}`} data-testid={`map-${field.key}`}>
                    <SelectValue placeholder="Unmapped" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unmapped</SelectItem>
                    {draft.headers.map((h, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {h || `Column ${i + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {draft.suggestedMapping[field.key] === mapping[field.key] &&
                  mapping[field.key] !== undefined && (
                    <Badge variant="muted" className="text-xs">
                      auto · high
                    </Badge>
                  )}
              </div>
            ))}
          </div>

          {/* live sample table of first 20 rows (§05.9) */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    {draft.headers.map((h, i) => (
                      <TableHead key={i}>
                        {h || `col_${i + 1}`}
                        {Object.entries(mapping).find(([, col]) => col === i) && (
                          <Badge variant="secondary" className="ml-1 text-xs">
                            {Object.entries(mapping).find(([, col]) => col === i)![0]}
                          </Badge>
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {draft.sampleRows.slice(0, 20).map((row, ri) => (
                    <TableRow key={ri} className="h-8">
                      {row.map((cell, ci) => (
                        <TableCell key={ci} className="max-w-[160px] truncate text-xs">
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("upload")}>
              Back
            </Button>
            <Button onClick={() => void confirmMapping()} disabled={!requiredMapped || busy} data-testid="map-next">
              {busy ? "Validating…" : "Next: Preview"}
            </Button>
          </div>
        </div>
      )}

      {step === "preview" && dryRun && (
        <div className="space-y-4">
          {(dryRun.euLocaleColumns ?? []).length > 0 && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm" data-testid="eu-locale-warning">
              Some numbers look European-formatted ({(dryRun.euLocaleColumns ?? []).join(", ")}
              {") — 1.234,56 reads as 1234.56. If that's wrong, adjust the source export"}
              {" format and re-upload; parsed amounts are shown below for verification (§15.8-3)."}
            </div>
          )}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-semibold text-gain" data-testid="accepted-count">{dryRun.accepted}</p>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Accepted</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-semibold text-loss" data-testid="rejected-count">{dryRun.rejected.length}</p>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Rejected</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-semibold">{dryRun.intraFileDuplicates.length + dryRun.crossBatchDupes}</p>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Duplicates</p>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            Dates are treated as market dates — no timezone conversion is applied (statement dates
            import exactly as written).
          </p>

          {Object.keys(dryRun.typeTally).length > 0 && (
            <div className="rounded-md border border-info/40 bg-info/10 p-3 text-sm">
              Some type values weren&apos;t recognized and will import as &quot;other&quot;:{" "}
              {Object.entries(dryRun.typeTally)
                .map(([k, v]) => `"${k}" ×${v}`)
                .join(", ")}
            </div>
          )}

          {dryRun.crossBatchDupes > 0 && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              {dryRun.crossBatchDupes} row{dryRun.crossBatchDupes === 1 ? "" : "s"} look identical to
              transactions you already have.{" "}
              <Select value={crossDupeDecision} onValueChange={(v) => setCrossDupeDecision(v as "skip" | "import")}>
                <SelectTrigger className="mt-2 w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Skip them (recommended)</SelectItem>
                  <SelectItem value="import">Import anyway (legitimate repeats)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {dryRun.rejected.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <Table data-testid="rejected-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Line</TableHead>
                      <TableHead>Field</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dryRun.rejected.slice(0, 50).map((r) => (
                      <TableRow key={r.line} className="h-8">
                        <TableCell className="font-mono text-xs">{r.line}</TableCell>
                        <TableCell className="text-xs">{r.field}</TableCell>
                        <TableCell className="text-xs">{r.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("map")}>
              Back: Remap
            </Button>
            <Button onClick={() => setStep("confirm")} disabled={allRejected} data-testid="preview-next">
              Next: Confirm
            </Button>
          </div>
          {allRejected && (
            <p className="text-sm text-muted-foreground">
              Every row was rejected — fix the file (download reasons after mapping) or adjust the
              column mapping.
            </p>
          )}
        </div>
      )}

      {step === "confirm" && dryRun && (
        <div className="max-w-lg space-y-4">
          <Card>
            <CardContent className="space-y-3 p-6">
              <p className="text-sm">
                Committing <strong>{dryRun.accepted}</strong> transactions
                {dryRun.rejected.length > 0 && <> ({dryRun.rejected.length} rejected rows stay out)</>}.
              </p>
              <div className="space-y-1">
                <label className="text-xs font-medium">Into account *</label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger aria-label="Target account" data-testid="account-select">
                    <SelectValue placeholder="Choose an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {(accounts?.data ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(accounts?.data ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No accounts yet — create one in Settings → Accounts first.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("preview")}>
              Back
            </Button>
            <Button onClick={() => void commit()} disabled={!accountId || busy} data-testid="commit-button">
              {busy ? "Committing…" : "Commit import"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
