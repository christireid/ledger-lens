"use client";

import { useSearchParams } from "next/navigation";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { EvidenceDrawer, type EvidenceDescriptor } from "@/components/app/evidence-drawer";
import { Icons } from "@/components/app/icons";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiError } from "@/lib/api/fetch";
import { qk } from "@/lib/api/keys";

/**
 * S-07 thread — §03.6.3 composer rules + §06.9 SSE consumption (fetch +
 * ReadableStream; citations interleave with tokens; stop() aborts).
 * While the AI gateway is degraded (§07.8 circuit open / not configured),
 * the composer disables with the partial-state banner (§05.7).
 */

type WireCitation = { ord: number; kind: string; refIds: string[]; label: string | null };
type WireMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  stopped: boolean;
  model: string | null;
  createdAt: string;
  citations: WireCitation[];
};
type WireThread = { id: string; title: string; messages: WireMessage[] };

type StreamState =
  | { phase: "idle" }
  | { phase: "streaming"; text: string; citations: WireCitation[]; toolLabel: string | null }
  | { phase: "error"; message: string; retryable: boolean };

export function ThreadClient({ investigationId }: { investigationId: string }) {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [draft, setDraft] = React.useState("");
  const [stream, setStream] = React.useState<StreamState>({ phase: "idle" });
  const [drawer, setDrawer] = React.useState<EvidenceDescriptor | null>(null);
  const [aiDegraded, setAiDegraded] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const liveRegionRef = React.useRef<HTMLDivElement>(null);
  const askedRef = React.useRef(false);

  const { data, isLoading } = useQuery({
    queryKey: qk.investigation(investigationId),
    queryFn: () => apiFetch<WireThread>(`/investigations/${investigationId}`),
    staleTime: 0, // §06.5.3: thread always fresh; never refetched mid-stream
    refetchOnWindowFocus: stream.phase !== "streaming",
  });

  const send = React.useCallback(
    async (content: string) => {
      if (!content.trim() || stream.phase === "streaming") return;
      setDraft("");
      // optimistic user message
      qc.setQueryData(qk.investigation(investigationId), (old: { data: WireThread } | undefined) =>
        old
          ? {
              ...old,
              data: {
                ...old.data,
                messages: [
                  ...old.data.messages,
                  {
                    id: `optimistic-${Date.now()}`,
                    role: "user" as const,
                    content,
                    stopped: false,
                    model: null,
                    createdAt: new Date().toISOString(),
                    citations: [],
                  },
                ],
              },
            }
          : old,
      );
      setStream({ phase: "streaming", text: "", citations: [], toolLabel: null });
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/investigations/${investigationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => null);
          const code = body?.error?.code;
          if (code === "upstream_unavailable") setAiDegraded(true);
          setStream({
            phase: "error",
            message: body?.error?.message ?? "The investigator could not respond.",
            retryable: code !== "upstream_unavailable",
          });
          return;
        }
        // §17.3 event protocol
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let text = "";
        const citations: WireCitation[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const rawEvent of events) {
            const lines = rawEvent.split("\n");
            const eventLine = lines.find((l) => l.startsWith("event:"));
            const dataLine = lines.find((l) => l.startsWith("data:"));
            if (!eventLine || !dataLine) continue;
            const type = eventLine.slice(6).trim();
            const payload = JSON.parse(dataLine.slice(5));
            if (type === "token") {
              text += payload.t;
              setStream({ phase: "streaming", text, citations: [...citations], toolLabel: null });
            } else if (type === "citation") {
              citations.push(payload);
              setStream({ phase: "streaming", text, citations: [...citations], toolLabel: null });
            } else if (type === "tool_status") {
              setStream({
                phase: "streaming",
                text,
                citations: [...citations],
                toolLabel: payload.state === "running" ? payload.label : null,
              });
            } else if (type === "done") {
              liveRegionRef.current?.replaceChildren(
                document.createTextNode("Response complete"),
              );
              setStream({ phase: "idle" });
              await qc.invalidateQueries({ queryKey: qk.investigation(investigationId) });
              await qc.invalidateQueries({ queryKey: qk.investigations() });
            } else if (type === "error") {
              setStream({ phase: "error", message: payload.message, retryable: payload.retryable ?? true });
            }
          }
        }
        // stream closed without a terminal event → finalize by refetch
        setStream((current) => (current.phase === "streaming" ? { phase: "idle" } : current));
        await qc.invalidateQueries({ queryKey: qk.investigation(investigationId) });
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setStream({ phase: "idle" });
          await qc.invalidateQueries({ queryKey: qk.investigation(investigationId) });
        } else {
          setStream({ phase: "error", message: "Connection lost mid-answer.", retryable: true });
        }
      }
    },
    [investigationId, qc, stream.phase],
  );

  // Starter question pre-send (S-06 → S-07)
  React.useEffect(() => {
    const ask = searchParams.get("ask");
    if (ask && !askedRef.current && !isLoading) {
      askedRef.current = true;
      void send(ask);
    }
  }, [searchParams, isLoading, send]);

  const messages = data?.data.messages.filter((m) => !m.id.startsWith("optimistic-")) ?? [];
  const optimistic = data?.data.messages.filter((m) => m.id.startsWith("optimistic-")) ?? [];

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col">
      <PageHeader title={data?.data.title ?? "Investigation"} />
      <div ref={liveRegionRef} role="status" aria-live="polite" className="sr-only" />

      {aiDegraded && (
        <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm" data-testid="ai-degraded-banner">
          The AI investigator is currently unavailable. Your history is fully readable; asking new
          questions is paused until the service recovers.
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto pb-4" data-testid="message-scroll">
        {isLoading && <Skeleton className="h-24 w-2/3" />}
        {[...messages, ...optimistic].map((m) => (
          <ChatMessage key={m.id} message={m} onCitation={(ids) => setDrawer({ kind: "ids", ids })} />
        ))}
        {stream.phase === "streaming" && (
          <div className="mr-auto max-w-[80%] rounded-lg border bg-card p-3 text-sm" data-testid="streaming-message">
            {stream.toolLabel && (
              <p className="mb-1 text-xs text-muted-foreground">{stream.toolLabel}…</p>
            )}
            <p className="whitespace-pre-wrap">{stream.text || "…"}</p>
            {stream.citations.map((c) => (
              <CitationChip key={c.ord} citation={c} onOpen={(ids) => setDrawer({ kind: "ids", ids })} />
            ))}
          </div>
        )}
        {stream.phase === "error" && (
          <div className="mr-auto max-w-[80%] rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p>{stream.message}</p>
            {stream.retryable && (
              <Button size="sm" variant="outline" className="mt-2" onClick={() => setStream({ phase: "idle" })}>
                Dismiss
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Composer — §03.6.3: pinned bottom, Enter send / Shift+Enter newline, 2000 cap */}
      <div className="border-t pt-3">
        <div className="flex gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
              if (e.key === "Escape" && stream.phase === "streaming") {
                abortRef.current?.abort();
              }
            }}
            placeholder={aiDegraded ? "Investigator unavailable" : "Ask about your data…"}
            disabled={aiDegraded || stream.phase === "streaming"}
            rows={2}
            aria-label="Message the investigator"
            data-testid="composer"
          />
          {stream.phase === "streaming" ? (
            <Button variant="destructive" onClick={() => abortRef.current?.abort()} data-testid="stop-button">
              Stop
            </Button>
          ) : (
            <Button onClick={() => void send(draft)} disabled={!draft.trim() || aiDegraded} data-testid="send-button">
              Send
            </Button>
          )}
        </div>
        {draft.length > 1800 && (
          <p className="mt-1 text-xs text-muted-foreground">{2000 - draft.length} characters left</p>
        )}
      </div>

      <EvidenceDrawer
        descriptor={drawer}
        open={drawer !== null}
        onOpenChange={(open) => !open && setDrawer(null)}
      />
    </div>
  );
}

function ChatMessage({
  message,
  onCitation,
}: {
  message: WireMessage;
  onCitation: (ids: string[]) => void;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = React.useState(false);
  return (
    <div
      className={
        isUser
          ? "ml-auto max-w-[80%] rounded-lg bg-muted p-3 text-sm"
          : "mr-auto max-w-[80%] rounded-lg border bg-card p-3 text-sm"
      }
      data-role={message.role}
    >
      <p className="whitespace-pre-wrap">{message.content}</p>
      {message.stopped && (
        <Badge variant="muted" className="mt-1">
          incomplete
        </Badge>
      )}
      {message.citations.map((c) => (
        <CitationChip key={c.ord} citation={c} onOpen={onCitation} />
      ))}
      {!isUser && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          {message.model && <Badge variant="muted">{message.model}</Badge>}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => {
              void navigator.clipboard.writeText(message.content);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <FeedbackButtons messageId={message.id} />
        </div>
      )}
    </div>
  );
}

function CitationChip({
  citation,
  onOpen,
}: {
  citation: WireCitation;
  onOpen: (ids: string[]) => void;
}) {
  const count = citation.refIds.length;
  return (
    <button
      type="button"
      className="mr-1 mt-1 inline-flex items-center rounded-full border bg-muted px-2 py-0.5 text-xs hover:bg-accent"
      onClick={() => onOpen(citation.refIds)}
      aria-label={`Evidence: ${count} ${citation.kind === "snapshot" ? "snapshot fields" : "transactions"}, opens drawer`}
      data-testid="citation-chip"
    >
      [{citation.label ?? `${count} txns`}]
    </button>
  );
}

function FeedbackButtons({ messageId }: { messageId: string }) {
  const [sent, setSent] = React.useState<1 | -1 | null>(null);
  const submit = async (value: 1 | -1) => {
    try {
      await apiFetch(`/messages/${messageId}/feedback`, {
        method: "POST",
        body: JSON.stringify({ value }),
      });
      setSent(value);
    } catch (err) {
      if (err instanceof ApiError) setSent(null);
    }
  };
  return (
    <span className="inline-flex gap-1">
      <button
        type="button"
        aria-label="Helpful"
        className={sent === 1 ? "text-gain" : "hover:text-foreground"}
        onClick={() => void submit(1)}
      >
        <Icons.thumbsUp className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Not helpful"
        className={sent === -1 ? "text-loss" : "hover:text-foreground"}
        onClick={() => void submit(-1)}
      >
        <Icons.thumbsDown className="h-3.5 w-3.5" aria-hidden />
      </button>
    </span>
  );
}
