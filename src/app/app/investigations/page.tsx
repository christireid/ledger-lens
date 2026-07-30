"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api/fetch";
import { qk } from "@/lib/api/keys";
import { useAppMutation } from "@/lib/api/mutations";

// S-06 — §05.7: thread list; empty state carries the three starter questions.

type WireInvestigation = { id: string; title: string; updatedAt: string };

const STARTERS = [
  "What were my largest fees this quarter?",
  "Why did my equity allocation change recently?",
  "Which subscriptions am I paying for every month?",
];

export default function InvestigationsPage() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: qk.investigations(),
    queryFn: () => apiFetch<WireInvestigation[]>("/investigations"),
    staleTime: 30_000,
  });

  const createThread = useAppMutation({
    mutationFn: (starter?: string) =>
      apiFetch<WireInvestigation>("/investigations", { method: "POST" }).then((res) => ({
        thread: res.data,
        starter,
      })),
    invalidate: [qk.investigations()],
    onSuccess: ({ thread, starter }) => {
      const suffix = starter ? `?ask=${encodeURIComponent(starter)}` : "";
      router.push(`/app/investigations/${thread.id}${suffix}`);
    },
  });

  const threads = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Investigations"
        actions={
          <Button onClick={() => createThread.mutate(undefined)} disabled={createThread.isPending} data-testid="new-investigation">
            New investigation
          </Button>
        }
      />
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : threads.length === 0 ? (
        <EmptyState
          variant="true-empty"
          title="Ask your first question"
          description="The AI investigator answers with citations to the exact ledger rows it used."
          action={
            <div className="flex flex-col gap-2">
              {STARTERS.map((starter) => (
                <Button
                  key={starter}
                  variant="outline"
                  onClick={() => createThread.mutate(starter)}
                  disabled={createThread.isPending}
                >
                  {starter}
                </Button>
              ))}
            </div>
          }
        />
      ) : (
        <div className="space-y-2" data-testid="thread-list">
          {threads.map((thread) => (
            <Card key={thread.id}>
              <CardContent className="p-0">
                <Link
                  href={`/app/investigations/${thread.id}`}
                  className="flex items-center justify-between p-4 hover:bg-muted/40"
                >
                  <span className="truncate font-medium">{thread.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(thread.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
