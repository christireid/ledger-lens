import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { and, asc, eq, sql as rawSql } from "drizzle-orm";

import type { Ctx } from "@/server/context";
import { investigations, messageCitations, messages } from "@/server/db/schema";
import { adminDb, withRls, type RlsDb } from "@/server/db/rls";
import { ConflictError, ForbiddenError, NotFoundError, RateLimitError, UpstreamError } from "@/server/errors";
import { toPublicId } from "@/lib/public-ids";
import {
  breakerOpen,
  getTransport,
  recordFailure,
  recordSuccess,
  type ChatMessage,
} from "@/server/ai/transport";
import { executeTool, TOOL_SPECS, type Citation, type ToolName } from "@/server/ai/tools";
import { logEvent } from "@/server/obs/logger";

/**
 * AI investigation service — §08. The model narrates; the database answers.
 * SSE per §17.3: tool_status / citation / token, terminal done|error,
 * heartbeat every 15 s. Citations are emitted server-side from real tool
 * results — the model cannot fabricate a chip (§08.5).
 */

export const PROMPT_VERSION = "investigator.v3";
const MAX_ROUNDS = 6; // §08.3
const MAX_OUTPUT_TOKENS = 1200; // §08.8

let systemPromptCache: string | null = null;
function systemPrompt(): string {
  systemPromptCache ??= readFileSync(
    path.join(process.cwd(), "src/server/ai/prompts", `${PROMPT_VERSION}.md`),
    "utf8",
  );
  return systemPromptCache;
}

// Per-workspace stream mutex (§05.7 / §08.11-6) — in-memory per instance,
// acceptable per the §07.8 short-lived-instance note.
const activeStreams = new Set<string>();

/** test-only: simulate an in-flight stream for the 409 path (§08.11-6). */
export function _lockWorkspaceForTest(workspaceId: string): () => void {
  activeStreams.add(workspaceId);
  return () => activeStreams.delete(workspaceId);
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function streamInvestigationMessage(
  ctx: Ctx,
  db: RlsDb,
  investigationId: string,
  content: string,
): Promise<Response> {
  if (!ctx.can("investigations:use")) throw new ForbiddenError();
  if (breakerOpen()) {
    throw new UpstreamError("The AI investigator is temporarily unavailable. Try again shortly.");
  }
  const [thread] = await db
    .select()
    .from(investigations)
    .where(and(eq(investigations.id, investigationId), eq(investigations.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!thread) throw new NotFoundError();
  if (activeStreams.has(ctx.workspaceId)) {
    throw new ConflictError("stream_in_progress", "An analysis is already running for this workspace.");
  }

  // §08.8/§21.6 — Postgres-backed daily caps, fail-CLOSED inside the request
  // transaction: 100 user messages/day/user, plus an optional env-configured
  // global daily token budget summed from ai_eval_log.
  const capRows = (await db.execute(
    rawSql`select count(*)::int as n from messages
           where workspace_id = ${ctx.workspaceId} and role = 'user'
             and created_at >= date_trunc('day', now())`,
  )) as unknown as Array<{ n: number }>;
  const secondsToMidnight = 86_400 - (Math.floor(Date.now() / 1000) % 86_400);
  if ((capRows[0]?.n ?? 0) >= 100) {
    throw new RateLimitError(secondsToMidnight);
  }
  const budget = Number(process.env.AI_DAILY_TOKEN_BUDGET ?? 0);
  if (budget > 0) {
    const usageRows = (await db.execute(
      rawSql`select coalesce(sum((usage->>'in')::bigint + (usage->>'out')::bigint), 0)::bigint as t
             from ai_eval_log where created_at >= date_trunc('day', now())`,
    )) as unknown as Array<{ t: string }>;
    if (Number(usageRows[0]?.t ?? 0) >= budget) {
      throw new RateLimitError(secondsToMidnight);
    }
  }

  // History window (§08.4-4): last 12 messages verbatim; older context is
  // replaced by the stored rolling summary (injected below).
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.investigationId, investigationId))
    .orderBy(asc(messages.createdAt));
  const window = history.slice(-12);
  const rollingSummary = history.length > window.length ? thread.summary : null;

  // Persist the user message inside the request's RLS transaction.
  await db.insert(messages).values({
    workspaceId: ctx.workspaceId,
    investigationId,
    role: "user",
    content,
  });

  const isFirstMessage = history.length === 0;
  const transport = getTransport();
  const workspaceIdForMutex = ctx.workspaceId;
  activeStreams.add(workspaceIdForMutex);
  // §24.2: stream requests log exactly two events — start and end-with-outcome.
  logEvent({ level: "info", event: "ai_stream", workspaceId: workspaceIdForMutex, meta: { phase: "start" } });

  // The SSE stream outlives the request's RLS transaction — tool executions
  // open their own withRls transactions per call.
  const userId = ctx.userId;
  const encoder = new TextEncoder();

  let aborted = false;
  const startedAt = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // §08.6: enqueue on a cancelled controller throws — treat it as a client
      // abort, never as an upstream failure.
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(sse(event, data)));
        } catch {
          aborted = true;
        }
      };
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15_000);

      let fullText = "";
      const citations: Array<Citation & { ord: number }> = [];
      const toolCallLog: string[] = [];
      let usage = { in: 0, out: 0 };
      let stopped = false;

      try {
        const chat: ChatMessage[] = [
          { role: "system", content: systemPrompt() },
          ...window.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          { role: "user", content },
        ];

        if (rollingSummary) {
          // §08.4-4: older context replaced by the stored rolling summary.
          chat.splice(1, 0, {
            role: "system",
            content: `Summary of earlier conversation: ${rollingSummary}`,
          });
        }
        // Workspace preamble (§08.4-3) — describe first, injected server-side.
        const preamble = await withRls(userId, (rlsDb) =>
          executeTool(ctx, rlsDb, "describe_workspace", {}),
        );
        chat.splice(1, 0, {
          role: "system",
          content: `Workspace data summary: ${preamble.json}`,
        });

        const failedTools = new Map<string, number>();

        for (let round = 0; round < MAX_ROUNDS; round++) {
          const result = await transport.turn({
            messages: chat,
            tools: TOOL_SPECS,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          });

          if (result.kind === "tool_calls") {
            chat.push({
              role: "assistant",
              content: `[tool calls: ${result.calls.map((c) => c.name).join(", ")}]`,
            });
            for (const call of result.calls) {
              const toolName = call.name as ToolName;
              // §08.10: malformed args twice → tool disabled for the rest of
              // this message; the model is told, and never re-invokes it.
              if ((failedTools.get(call.name) ?? 0) >= 2) {
                chat.push({
                  role: "tool",
                  toolCallId: call.id,
                  name: call.name,
                  content: JSON.stringify({ error: "tool_disabled_for_this_message" }),
                });
                continue;
              }
              toolCallLog.push(call.name);
              send("tool_status", { tool: call.name, state: "running", label: labelFor(call.name) });
              try {
                const outcome = await withRls(userId, (rlsDb) =>
                  executeTool(ctx, rlsDb, toolName, call.args),
                );
                if (outcome.citation) {
                  const ord = citations.length + 1;
                  citations.push({ ...outcome.citation, ord });
                  send("citation", {
                    id: call.id,
                    ord,
                    kind: outcome.citation.kind,
                    refIds:
                      outcome.citation.kind === "snapshot"
                        ? outcome.citation.refIds
                        : outcome.citation.refIds.map((id) => toPublicId("transaction", id)),
                    label: outcome.citation.label,
                  });
                }
                chat.push({ role: "tool", toolCallId: call.id, name: call.name, content: outcome.json });
                send("tool_status", { tool: call.name, state: "done", label: labelFor(call.name) });
              } catch (err) {
                // §08.10: invalid args → error result back to the model, 1 retry;
                // twice → tool disabled for the message.
                const failures = (failedTools.get(call.name) ?? 0) + 1;
                failedTools.set(call.name, failures);
                chat.push({
                  role: "tool",
                  toolCallId: call.id,
                  name: call.name,
                  content: JSON.stringify({
                    error: failures >= 2 ? "tool_disabled_for_this_message" : String((err as Error).message),
                  }),
                });
                send("tool_status", { tool: call.name, state: "done", label: labelFor(call.name) });
              }
            }
            if (round === MAX_ROUNDS - 1) {
              chat.push({
                role: "system",
                content:
                  "Tool-call budget exhausted. Answer now from the results you have and note the investigation is partial.",
              });
            }
            continue;
          }

          // Final text — stream tokens (§03.8.2: append unanimated client-side).
          for await (const token of result.tokens) {
            fullText += token;
            send("token", { t: token });
            if (aborted) break; // §08.6: stop generating for a gone client
          }
          usage = result.usage;
          break;
        }

        recordSuccess();
        if (aborted) stopped = true; // §08.6: partial persisted with stopped: true
      } catch (err) {
        if (aborted) {
          // Client went away mid-stream — not an upstream failure (§07.8).
          stopped = true;
        } else {
          recordFailure();
          send("error", {
            code: err instanceof UpstreamError ? "upstream_unavailable" : "internal_error",
            message:
              err instanceof UpstreamError
                ? err.message
                : "The investigator hit an unexpected error.",
            retryable: true,
          });
          stopped = true;
        }
      }

      // Persist the assistant message + citations + eval log (§08.12: required
      // fields schema-enforced). Admin handle: the request transaction is gone.
      try {
        const db2 = adminDb();
        const [assistantRow] = await db2
          .insert(messages)
          .values({
            workspaceId: workspaceIdForMutex,
            investigationId,
            role: "assistant",
            content: fullText || "(no answer produced)",
            stopped,
            promptVersion: PROMPT_VERSION,
            model: transport.model,
            usage,
          })
          .returning({ id: messages.id });
        if (citations.length && assistantRow) {
          await db2.insert(messageCitations).values(
            citations.map((c) => ({
              workspaceId: workspaceIdForMutex,
              messageId: assistantRow.id,
              ord: c.ord,
              kind: c.kind,
              refIds: c.refIds,
              label: c.label,
            })),
          );
        }
        // §08.9 eval-log contract: real toolCalls and measured latency.
        await db2.execute(
          (await import("drizzle-orm")).sql`
            insert into ai_eval_log (workspace_id, message_id, prompt_version, model, tool_calls, latency_ms, usage)
            values (${workspaceIdForMutex}, ${assistantRow?.id ?? null}, ${PROMPT_VERSION}, ${transport.model},
                    ${JSON.stringify(toolCallLog)}, ${Date.now() - startedAt}, ${JSON.stringify(usage)})
          `,
        );
        // Title generation on first message (§08.2): mini-model single
        // completion, truncation fallback when the gateway yields nothing.
        if (isFirstMessage && fullText) {
          const generated = await transport
            .completeOnce({ intent: "title", prompt: content, maxOutputTokens: 60 })
            .catch(() => "");
          const title =
            generated || (content.length > 60 ? `${content.slice(0, 57)}…` : content);
          await db2
            .update(investigations)
            .set({ title: title.slice(0, 120) })
            .where(eq(investigations.id, investigationId));
        }
        // §08.4-4: rolling summary maintained in the background.
        if (fullText) {
          const summarySeed = `${thread.summary ?? ""} Q: ${content} A: ${fullText}`.trim();
          const summary = await transport
            .completeOnce({ intent: "summary", prompt: summarySeed, maxOutputTokens: 200 })
            .catch(() => "");
          if (summary) {
            await db2
              .update(investigations)
              .set({ summary: summary.slice(0, 1000) })
              .where(eq(investigations.id, investigationId));
          }
        }
        if (assistantRow) {
          send("done", {
            messageId: toPublicId("message", assistantRow.id),
            usage,
            stopped,
          });
        }
        logEvent({
          level: "info",
          event: "ai_stream",
          workspaceId: workspaceIdForMutex,
          latencyMs: Date.now() - startedAt,
          meta: { phase: "end", outcome: stopped ? (aborted ? "aborted" : "error") : "ok" },
        });
      } catch (err) {
        logEvent({
          level: "error",
          event: "ai_stream",
          workspaceId: workspaceIdForMutex,
          latencyMs: Date.now() - startedAt,
          meta: { phase: "end", outcome: "finalize_failed", name: err instanceof Error ? err.name : typeof err },
        });
      } finally {
        clearInterval(heartbeat);
        activeStreams.delete(workspaceIdForMutex);
        controller.close();
      }
    },
    cancel() {
      // §08.6: client abort → partial persisted with stopped: true by the
      // finalize block (fullText holds what streamed); mutex released there.
      aborted = true;
      activeStreams.delete(workspaceIdForMutex);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function labelFor(tool: string): string {
  switch (tool) {
    case "query_transactions":
      return "Reading matching transactions";
    case "aggregate_transactions":
      return "Totaling transactions";
    case "get_positions":
      return "Loading current positions";
    case "get_snapshot_series":
      return "Loading value history";
    case "list_anomalies":
      return "Checking detector findings";
    case "describe_workspace":
      return "Surveying the workspace";
    default:
      return "Working";
  }
}
