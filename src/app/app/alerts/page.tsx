"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { apiFetch, ApiError } from "@/lib/api/fetch";
import { qk } from "@/lib/api/keys";
import { useAppMutation } from "@/lib/api/mutations";

/**
 * S-08 Alerts — §05.8: rule list + creation dialog with type-specific fields
 * generated from the §14.2 paramsSchemas; creation preview via the shared
 * detector path ("would have triggered n times in the last 90 days").
 */

type WireRule = {
  id: string;
  type: string;
  name: string;
  params: Record<string, unknown>;
  enabled: boolean;
  lastTriggeredAt: string | null;
  triggerCount: number;
};

const RULE_TYPES = [
  { value: "large_transaction", label: "Large transaction" },
  { value: "fee_spike", label: "Fee spike" },
  { value: "allocation_drift", label: "Allocation drift" },
  { value: "account_inactivity", label: "Account inactivity" },
] as const;

const FormSchema = z.object({
  type: z.enum(["large_transaction", "fee_spike", "allocation_drift", "account_inactivity"]),
  name: z.string().min(1, "Name the rule").max(120),
  threshold: z.string().optional(),
  sigma: z.coerce.number().min(1).max(4).optional(),
  driftPp: z.coerce.number().min(1).max(50).optional(),
  days: z.coerce.number().min(7).max(365).optional(),
});
type FormValues = z.infer<typeof FormSchema>;

function toParams(values: FormValues): Record<string, unknown> {
  switch (values.type) {
    case "large_transaction":
      return { threshold: values.threshold || "5000" };
    case "fee_spike":
      return { sigma: values.sigma ?? 2, minMonths: 3 };
    case "allocation_drift":
      return { driftPp: values.driftPp ?? 5, baselineDays: 90 };
    case "account_inactivity":
      return { days: values.days ?? 45 };
  }
}

export default function AlertsPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<number | null>(null);
  const [duplicateOf, setDuplicateOf] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: qk.alerts(),
    queryFn: () => apiFetch<WireRule[]>("/alerts"),
    staleTime: 30_000,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    mode: "onTouched",
    defaultValues: { type: "large_transaction", name: "", threshold: "5000" },
  });
  const type = form.watch("type");

  const createRule = useAppMutation({
    mutationFn: (values: FormValues) =>
      apiFetch<WireRule>("/alerts", {
        method: "POST",
        body: JSON.stringify({
          type: values.type,
          name: values.name,
          enabled: true,
          params: toParams(values),
        }),
      }),
    invalidate: [qk.alerts()],
    successToast: "Alert created",
    onSuccess: () => {
      setDialogOpen(false);
      setPreview(null);
      form.reset();
    },
  });

  const toggleRule = useAppMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiFetch(`/alerts/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),
    invalidate: [qk.alerts()],
  });

  const deleteRule = useAppMutation({
    mutationFn: (id: string) => apiFetch(`/alerts/${id}`, { method: "DELETE" }),
    invalidate: [qk.alerts()],
    successToast: "Alert deleted",
  });

  async function runPreview(values: FormValues) {
    setPreview(null);
    try {
      const res = await apiFetch<{ wouldTrigger: number }>("/alerts/preview", {
        method: "POST",
        body: JSON.stringify({
          type: values.type,
          name: values.name || "preview",
          enabled: true,
          params: toParams(values),
        }),
      });
      setPreview(res.data.wouldTrigger);
    } catch {
      setPreview(null);
    }
  }

  async function submit(values: FormValues) {
    setDuplicateOf(null);
    try {
      await createRule.mutateAsync(values);
    } catch (err) {
      if (err instanceof ApiError && err.code === "duplicate_rule") {
        setDuplicateOf((err as ApiError & { requestId?: string }).message);
        form.setError("name", { message: "An identical rule already exists." });
      }
    }
  }

  const rules = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Alerts"
        actions={
          <Button onClick={() => setDialogOpen(true)} data-testid="new-alert">
            New alert
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          variant="true-empty"
          title="No standing rules yet"
          description="Alerts watch your data continuously — large transactions, fee spikes, allocation drift, and quiet accounts."
          action={<Button onClick={() => setDialogOpen(true)}>Create your first alert</Button>}
        />
      ) : (
        <div className="space-y-2" data-testid="rule-list">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{rule.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {RULE_TYPES.find((t) => t.value === rule.type)?.label} ·{" "}
                    {JSON.stringify(rule.params)} · triggered {rule.triggerCount}×
                    {rule.lastTriggeredAt &&
                      ` · last ${new Date(rule.lastTriggeredAt).toLocaleDateString("en-US")}`}
                  </p>
                </div>
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={(enabled) => toggleRule.mutate({ id: rule.id, enabled })}
                  aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    // §03.6.5: destructive confirm before deleting a rule.
                    if (window.confirm(`Delete alert rule "${rule.name}"? Past notifications remain.`)) {
                      deleteRule.mutate(rule.id);
                    }
                  }}
                >
                  Delete
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New alert rule</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(submit)} className="space-y-4" data-testid="alert-form">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {RULE_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Wire over $5,000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {type === "large_transaction" && (
                <FormField
                  control={form.control}
                  name="threshold"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount threshold (USD)</FormLabel>
                      <FormControl>
                        <Input inputMode="decimal" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {type === "fee_spike" && (
                <FormField
                  control={form.control}
                  name="sigma"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sensitivity (standard deviations, 1–4)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.5" min={1} max={4} {...field} value={field.value ?? 2} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {type === "allocation_drift" && (
                <FormField
                  control={form.control}
                  name="driftPp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Drift threshold (percentage points, 1–50)</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} max={50} {...field} value={field.value ?? 5} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {type === "account_inactivity" && (
                <FormField
                  control={form.control}
                  name="days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quiet days before alerting (7–365)</FormLabel>
                      <FormControl>
                        <Input type="number" min={7} max={365} {...field} value={field.value ?? 45} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {preview !== null && (
                <p className="rounded-md bg-muted p-2 text-sm" data-testid="preview-result">
                  Would have triggered <strong>{preview}</strong> time{preview === 1 ? "" : "s"} in
                  the last 90 days.
                </p>
              )}
              {duplicateOf && <p className="text-sm text-destructive">{duplicateOf}</p>}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => runPreview(form.getValues())}
                  data-testid="preview-button"
                >
                  Preview
                </Button>
                <Button type="submit" disabled={createRule.isPending}>
                  {createRule.isPending ? "Creating…" : "Create alert"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
