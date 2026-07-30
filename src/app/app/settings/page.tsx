"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api/fetch";
import { qk } from "@/lib/api/keys";
import { useAppMutation } from "@/lib/api/mutations";
import { usePersistedPreference } from "@/lib/hooks/use-persisted-preference";

// S-12 Settings — §05.10: Profile / Workspace / Accounts / Appearance / Danger zone.

type WireAccount = { id: string; name: string; type: string; archivedAt: string | null };
type WireWorkspace = { id: string; name: string; isDemo: boolean; baseCurrency: string };

export default function SettingsPage() {
  const qc = useQueryClient();
  const { theme, setTheme } = useTheme();
  const [density, setDensity] = usePersistedPreference<"comfortable" | "compact">(
    "table-density",
    "comfortable",
  );
  const [deleteConfirm, setDeleteConfirm] = React.useState("");
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [newAccountName, setNewAccountName] = React.useState("");
  const [newAccountType, setNewAccountType] = React.useState("bank");

  const { data: workspace } = useQuery({
    queryKey: qk.workspace(),
    queryFn: () => apiFetch<WireWorkspace>("/workspace"),
  });
  const { data: accounts } = useQuery({
    queryKey: qk.accounts(true),
    queryFn: () => apiFetch<WireAccount[]>("/accounts?includeArchived=true"),
  });

  const renameWorkspace = useAppMutation({
    mutationFn: (name: string) =>
      apiFetch("/workspace", { method: "PATCH", body: JSON.stringify({ name }) }),
    invalidate: [qk.workspace()],
    successToast: "Workspace renamed",
  });

  const demoMutation = useAppMutation({
    mutationFn: (action: "seed" | "clear") =>
      apiFetch("/workspace/demo", { method: "POST", body: JSON.stringify({ action }) }),
    invalidate: [["dashboard"], ["transactions"], ["anomalies"], ["imports"], qk.workspace(), ["accounts"]],
    successToast: "Demo data updated",
  });

  const createAccount = useAppMutation({
    mutationFn: () =>
      apiFetch("/accounts", {
        method: "POST",
        body: JSON.stringify({ name: newAccountName, type: newAccountType, currency: "USD" }),
      }),
    invalidate: [["accounts"]],
    successToast: "Account created",
    onSuccess: () => setNewAccountName(""),
  });

  const archiveAccount = useAppMutation({
    mutationFn: (id: string) => apiFetch(`/accounts/${id}/archive`, { method: "POST" }),
    invalidate: [["accounts"], ["transactions"], ["dashboard"]],
    successToast: "Account archived",
  });

  async function deleteWorkspace() {
    try {
      await apiFetch("/workspace", { method: "DELETE" });
      qc.clear();
      window.location.href = "/";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  return (
    <>
      <PageHeader title="Settings" />
      <Tabs defaultValue="workspace">
        <TabsList aria-label="Settings sections">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="danger">Danger zone</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Profile fields (name, email, password, passkeys) are managed by the identity provider.
              Open the account menu in the sidebar footer to edit them.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workspace">
          <Card>
            <CardHeader>
              <CardTitle>Workspace</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex max-w-md gap-2">
                <Input
                  defaultValue={workspace?.data.name ?? ""}
                  aria-label="Workspace name"
                  id="workspace-name"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    const input = document.getElementById("workspace-name") as HTMLInputElement;
                    renameWorkspace.mutate(input.value);
                  }}
                >
                  Rename
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Base currency: <Badge variant="muted">{workspace?.data.baseCurrency ?? "USD"}</Badge>{" "}
                (display only in MVP)
              </p>
              <div className="space-y-2 rounded-md border p-4">
                <p className="text-sm font-medium">
                  Demo data {workspace?.data.isDemo && <Badge variant="muted">active</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  Load 24 months of realistic sample data with planted findings, or clear it out.
                  Loading replaces the workspace&apos;s current data.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => demoMutation.mutate("seed")}
                    disabled={demoMutation.isPending}
                    data-testid="seed-demo"
                  >
                    {demoMutation.isPending ? "Working…" : "Load demo data"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => demoMutation.mutate("clear")}
                    disabled={demoMutation.isPending}
                  >
                    Clear data
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accounts">
          <Card>
            <CardHeader>
              <CardTitle>Accounts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex max-w-lg gap-2">
                <Input
                  placeholder="Account name"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  aria-label="New account name"
                />
                <Select value={newAccountType} onValueChange={setNewAccountType}>
                  <SelectTrigger className="w-36" aria-label="Account type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="brokerage">Brokerage</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => createAccount.mutate(undefined)}
                  disabled={!newAccountName.trim() || createAccount.isPending}
                  data-testid="create-account"
                >
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {(accounts?.data ?? [])
                  .filter((a) => !a.archivedAt)
                  .map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-md border p-3">
                      <span className="text-sm font-medium">
                        {a.name} <Badge variant="muted">{a.type}</Badge>
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => archiveAccount.mutate(a.id)}>
                        Archive
                      </Button>
                    </div>
                  ))}
              </div>
              {(accounts?.data ?? []).some((a) => a.archivedAt) && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    Archived accounts
                  </summary>
                  <div className="mt-2 space-y-2">
                    {(accounts?.data ?? [])
                      .filter((a) => a.archivedAt)
                      .map((a) => (
                        <div key={a.id} className="flex items-center justify-between rounded-md border p-3 opacity-70">
                          <span className="text-sm">{a.name}</span>
                          <Badge variant="muted">archived</Badge>
                        </div>
                      ))}
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex max-w-md items-center justify-between">
                <span>Theme</span>
                <Select value={theme ?? "system"} onValueChange={setTheme}>
                  <SelectTrigger className="w-36" aria-label="Theme">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">System</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex max-w-md items-center justify-between">
                <span>Table density</span>
                <Select value={density} onValueChange={(v) => setDensity(v as never)}>
                  <SelectTrigger className="w-36" aria-label="Table density">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comfortable">Comfortable</SelectItem>
                    <SelectItem value="compact">Compact</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Reduced motion follows your system setting automatically.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="danger">
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-destructive">Danger zone</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Deleting the workspace removes every account, transaction, import, anomaly, and
                investigation permanently. Your sign-in remains.
              </p>
              <Button variant="destructive" onClick={() => setDeleteOpen(true)} data-testid="delete-workspace">
                Delete workspace
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete workspace &quot;{workspace?.data.name}&quot;?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This cannot be undone. Type the workspace name to confirm.
          </p>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={workspace?.data.name}
            aria-label="Type the workspace name to confirm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirm !== workspace?.data.name}
              onClick={() => void deleteWorkspace()}
            >
              Delete workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
