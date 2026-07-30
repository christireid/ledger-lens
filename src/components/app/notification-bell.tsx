"use client";

import { useQuery } from "@tanstack/react-query";

import { Icons } from "@/components/app/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiFetch } from "@/lib/api/fetch";
import { qk } from "@/lib/api/keys";
import { useAppMutation } from "@/lib/api/mutations";

type Notification = {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

/** NotificationList — §04.6: day grouping, unread dot, mark-all-read. */
export function NotificationBell() {
  const { data } = useQuery({
    queryKey: qk.notifications(),
    queryFn: () => apiFetch<Notification[]>("/notifications"),
    staleTime: 30_000,
  });
  const unread = Number(data?.meta?.total ?? 0);

  const markAll = useAppMutation({
    mutationFn: () =>
      apiFetch("/notifications/read", { method: "POST", body: JSON.stringify({ all: true }) }),
    invalidate: [qk.notifications()],
  });

  const byDay = new Map<string, Notification[]>();
  for (const n of data?.data ?? []) {
    const day = new Date(n.createdAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    byDay.set(day, [...(byDay.get(day) ?? []), n]);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          data-testid="notification-bell"
        >
          <Icons.alert className="h-5 w-5" aria-hidden />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-xs font-semibold text-white">
              {unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b p-3">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <Button size="sm" variant="ghost" onClick={() => markAll.mutate(undefined)}>
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {byDay.size === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nothing yet. Alerts and high-severity findings will land here.
            </p>
          )}
          {[...byDay.entries()].map(([day, items]) => (
            <div key={day}>
              <p className="px-3 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {day}
              </p>
              {items.map((n) => (
                <div
                  key={n.id}
                  tabIndex={0}
                  role="listitem"
                  className="flex gap-2 border-b px-3 py-2 last:border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {!n.readAt && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-info" aria-label="Unread" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{n.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        {unread > 0 && <Badge className="sr-only">{unread} unread</Badge>}
      </PopoverContent>
    </Popover>
  );
}
