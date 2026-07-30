"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { FreshnessIndicator } from "@/components/app/freshness-indicator";
import { Icons } from "@/components/app/icons";
import { NotificationBell } from "@/components/app/notification-bell";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api/fetch";
import { qk } from "@/lib/api/keys";
import { cn } from "@/lib/utils/cn";
import { useTheme } from "next-themes";

/**
 * AppShell — §03.4: sidebar (256px / 64px rail < 1280px) + top bar (56px) +
 * content (max 1440px). Six destinations in the §03.3.1 order. Cmd/Ctrl-K
 * palette + g-shortcuts (§03.9).
 */

const NAV = [
  { href: "/app/dashboard", label: "Dashboard", icon: Icons.dashboard, key: "d" },
  { href: "/app/ledger", label: "Ledger", icon: Icons.ledger, key: "l" },
  { href: "/app/anomalies", label: "Anomalies", icon: Icons.anomaly, key: "a" },
  { href: "/app/investigations", label: "Investigations", icon: Icons.investigation, key: "i" },
  { href: "/app/alerts", label: "Alerts", icon: Icons.alert, key: "r" },
  { href: "/app/imports", label: "Imports", icon: Icons.import, key: "m" },
] as const;

type DashboardData = {
  latestSnapshot: { computedAt: string | null } | null;
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const pendingGo = React.useRef(false);

  const { data: workspace } = useQuery({
    queryKey: qk.workspace(),
    queryFn: () => apiFetch<{ name: string; isDemo: boolean }>("/workspace"),
    staleTime: 5 * 60_000,
  });
  const { data: dashboard } = useQuery({
    queryKey: qk.dashboard("90d"),
    queryFn: () => apiFetch<DashboardData>("/dashboard?range=90d"),
    staleTime: 60_000,
  });

  // §03.9 keyboard model: Cmd/Ctrl-K + g-shortcuts, suppressed in inputs.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (inInput) return;
      if (e.key === "g") {
        pendingGo.current = true;
        setTimeout(() => (pendingGo.current = false), 1000);
        return;
      }
      if (pendingGo.current) {
        const dest = NAV.find((n) => n.key === e.key);
        if (dest) router.push(dest.href);
        pendingGo.current = false;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <div className="flex min-h-screen">
      {/* §05.11: below-1024 interstitial for /app/* */}
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-background p-8 text-center lg:hidden">
        <h1 className="text-lg font-semibold">Ledger Lens works best on a larger screen</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The investigation workspace supports desktop and tablet-landscape viewports (1024px and up).
        </p>
        <Link className="text-sm text-primary underline underline-offset-4" href="/">
          Back to the overview page
        </Link>
      </div>

      {/* Sidebar */}
      <aside
        className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col border-r bg-card lg:flex xl:w-64"
        aria-label="Primary"
      >
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <span className="text-lg font-bold tracking-tight text-primary">◎</span>
          <span className="hidden text-sm font-bold tracking-tight xl:inline">Ledger Lens</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" aria-hidden />
                <span className="hidden xl:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-2">
          <Link
            href="/app/settings"
            aria-current={pathname.startsWith("/app/settings") ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname.startsWith("/app/settings")
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icons.settings className="h-5 w-5 shrink-0" aria-hidden />
            <span className="hidden xl:inline">Settings</span>
          </Link>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — §03.3.3 */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b bg-background/95 px-6 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate text-sm font-medium">{workspace?.data.name ?? "…"}</span>
            {workspace?.data.isDemo && (
              <Badge variant="muted" data-testid="demo-badge">
                Demo data
              </Badge>
            )}
            <FreshnessIndicator
              computedAt={dashboard?.data.latestSnapshot?.computedAt ?? null}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              aria-label="Open command palette"
            >
              <Icons.search className="h-3.5 w-3.5" aria-hidden />
              <span>Search…</span>
              <kbd className="rounded border bg-muted px-1 font-mono text-xs">⌘K</kbd>
            </button>
            <NotificationBell />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-6">{children}</main>
      </div>

      {/* Command palette — §03.3.3 accelerator, not primary path */}
      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder="Go to page or run an action…" />
        <CommandList>
          <PaletteDynamicGroups
            enabled={paletteOpen}
            onNavigate={(href) => {
              router.push(href);
              setPaletteOpen(false);
            }}
          />
          <CommandEmpty className="p-4 text-sm text-muted-foreground">No results.</CommandEmpty>
          <CommandGroup heading="Navigate">
            {NAV.map((item) => (
              <CommandItem
                key={item.href}
                onSelect={() => {
                  router.push(item.href);
                  setPaletteOpen(false);
                }}
              >
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
              </CommandItem>
            ))}
            <CommandItem
              onSelect={() => {
                router.push("/app/settings");
                setPaletteOpen(false);
              }}
            >
              <Icons.settings className="h-4 w-4" aria-hidden />
              Settings
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Actions">
            <CommandItem
              onSelect={() => {
                // §04.9: the theme toggle lives in Settings AND the palette.
                setTheme(resolvedTheme === "dark" ? "light" : "dark");
                setPaletteOpen(false);
              }}
            >
              <Icons.settings className="h-4 w-4" aria-hidden />
              Toggle theme
            </CommandItem>
            <CommandItem
              onSelect={() => {
                router.push("/app/imports/new");
                setPaletteOpen(false);
              }}
            >
              <Icons.import className="h-4 w-4" aria-hidden />
              New import
            </CommandItem>
            <CommandItem
              onSelect={() => {
                router.push("/app/investigations");
                setPaletteOpen(false);
              }}
            >
              <Icons.investigation className="h-4 w-4" aria-hidden />
              Ask a question
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}


/** §03.3.3: the palette is data-driven — accounts and recent investigations. */
function PaletteDynamicGroups({
  enabled,
  onNavigate,
}: {
  enabled: boolean;
  onNavigate: (href: string) => void;
}) {
  const { data: accounts } = useQuery({
    queryKey: qk.accounts(false),
    queryFn: () => apiFetch<Array<{ id: string; name: string }>>("/accounts"),
    staleTime: 5 * 60_000,
    enabled,
  });
  const { data: investigations } = useQuery({
    queryKey: qk.investigations(),
    queryFn: () => apiFetch<Array<{ id: string; title: string }>>("/investigations"),
    staleTime: 60_000,
    enabled,
  });
  return (
    <>
      {(accounts?.data ?? []).length > 0 && (
        <CommandGroup heading="Accounts">
          {(accounts?.data ?? []).slice(0, 5).map((a) => (
            <CommandItem key={a.id} onSelect={() => onNavigate(`/app/ledger?account=${a.id}`)}>
              <Icons.ledger className="h-4 w-4" aria-hidden />
              {a.name}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {(investigations?.data ?? []).length > 0 && (
        <CommandGroup heading="Recent investigations">
          {(investigations?.data ?? []).slice(0, 5).map((inv) => (
            <CommandItem key={inv.id} onSelect={() => onNavigate(`/app/investigations/${inv.id}`)}>
              <Icons.investigation className="h-4 w-4" aria-hidden />
              {inv.title}
            </CommandItem>
          ))}
        </CommandGroup>
      )}
    </>
  );
}
