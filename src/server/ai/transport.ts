import "server-only";

import { env, openAiIsMocked } from "@/server/env";
import { UpstreamError } from "@/server/errors";

/**
 * AI transport — §07.8/§08. The gateway seam: services never import vendor
 * SDKs. The mock transport (OPENAI_API_KEY=MOCK, §22) exercises tool wiring,
 * citations, and refusal mechanics deterministically.
 */

export type ChatMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export type ToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
};

export type TurnResult =
  | { kind: "tool_calls"; calls: Array<{ id: string; name: string; args: unknown }> }
  | { kind: "text"; tokens: AsyncIterable<string>; usage: { in: number; out: number } };

export type Transport = {
  turn(input: { messages: ChatMessage[]; tools: ToolSpec[]; maxOutputTokens: number }): Promise<TurnResult>;
  model: string;
};

// ── Circuit breaker (§07.8: open after 3 consecutive failures, 60 s half-open) ──
let consecutiveFailures = 0;
let openedAt = 0;

export function breakerOpen(): boolean {
  if (consecutiveFailures < 3) return false;
  if (Date.now() - openedAt > 60_000) return false; // half-open: allow a probe
  return true;
}

export function recordSuccess(): void {
  consecutiveFailures = 0;
}

export function recordFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures === 3) openedAt = Date.now();
}

/** test-only reset */
export function resetBreaker(): void {
  consecutiveFailures = 0;
  openedAt = 0;
}

// ── Mock transport (§22 mocked gateway) ──────────────────────────────────────
async function* tokenize(text: string): AsyncIterable<string> {
  const words = text.split(/(?<=\s)/);
  for (const w of words) yield w;
}

const REFUSAL_ADVICE =
  "I can describe what happened in your data, but I don't give buy or sell advice. I can break down your holdings, fees, or cash flows instead — ask away.";
const REFUSAL_UNGROUNDED =
  "I can't answer that from your workspace data. The tools here cover transactions, positions, snapshots, and anomalies — future values and outside information aren't in them, so I won't guess.";

function lastUser(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "user") return m.content.toLowerCase();
  }
  return "";
}

function toolResults(messages: ChatMessage[]): Array<{ name: string; content: string }> {
  return messages
    .filter((m): m is Extract<ChatMessage, { role: "tool" }> => m.role === "tool")
    .map((m) => ({ name: m.name, content: m.content }));
}

/**
 * Deterministic mock: round 1 picks tools by question intent; round 2 answers
 * strictly from tool-result JSON (verbatim figures, [c:N] markers). Advice and
 * ungroundable questions refuse without touching tools.
 */
function createMockTransport(): Transport {
  return {
    model: "mock-investigator",
    async turn({ messages }) {
      const question = lastUser(messages);
      const results = toolResults(messages);

      const wantsAdvice = /\bshould i\b|\bbuy\b.*\?|advice|recommend/.test(question) && !/fee|spent|charge/.test(question);
      const ungroundable = /tomorrow|next month price|predict|will .* be worth|stock price next/.test(question);
      if (wantsAdvice) {
        return { kind: "text", tokens: tokenize(REFUSAL_ADVICE), usage: { in: 100, out: 40 } };
      }
      if (ungroundable) {
        return { kind: "text", tokens: tokenize(REFUSAL_UNGROUNDED), usage: { in: 100, out: 48 } };
      }

      if (results.length === 0) {
        // Round 1: describe first (§08.3 convention) + intent tool in parallel.
        const calls: Array<{ id: string; name: string; args: unknown }> = [
          { id: "call_describe", name: "describe_workspace", args: {} },
        ];
        if (/fee/.test(question)) {
          calls.push({
            id: "call_fees",
            name: "aggregate_transactions",
            args: { filter: { types: ["fee"] }, group_by: "month", metric: "sum" },
          });
        } else if (/holding|position|allocation|portfolio/.test(question)) {
          calls.push({ id: "call_positions", name: "get_positions", args: {} });
        } else if (/anomal|suspicious|flag/.test(question)) {
          calls.push({ id: "call_anomalies", name: "list_anomalies", args: { status: "open" } });
        } else if (/balance|value over time|history|trend/.test(question)) {
          calls.push({ id: "call_series", name: "get_snapshot_series", args: { range: "90d" } });
        } else {
          calls.push({
            id: "call_tx",
            name: "query_transactions",
            args: { filter: {}, limit: 10, sort: "date" },
          });
        }
        return { kind: "tool_calls", calls };
      }

      // Round 2: answer from tool results only.
      const parts: string[] = [];
      let citationIndex = 0;
      for (const r of results) {
        if (r.name === "describe_workspace") continue;
        citationIndex += 1;
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(r.content) as Record<string, unknown>;
        } catch {
          continue;
        }
        if (parsed.error) {
          parts.push(`One lookup could not run: ${String(parsed.error)}.`);
          continue;
        }
        if (r.name === "aggregate_transactions") {
          const groups = (parsed.groups ?? []) as Array<{ key: string; sum?: string; count?: number; currency?: string }>;
          const top = [...groups]
            .sort((a, b) => Math.abs(Number(b.sum ?? 0)) - Math.abs(Number(a.sum ?? 0)))
            .slice(0, 3);
          if (top.length === 0) {
            parts.push(`No matching rows were found for that aggregation [c:${citationIndex}].`);
          } else {
            parts.push(
              `The largest totals were ${top
                .map((g) => `${g.key}: ${g.sum ?? g.count} ${g.currency ?? ""}`.trim())
                .join("; ")} [c:${citationIndex}].`,
            );
          }
        } else if (r.name === "get_positions") {
          const positions = (parsed.positions ?? []) as Array<{ symbol?: string; marketValue: string; currency: string }>;
          const top = positions.slice(0, 3);
          parts.push(
            top.length
              ? `Your largest holdings by value are ${top
                  .map((p) => `${p.symbol ?? "?"} at ${p.marketValue} ${p.currency}`)
                  .join(", ")} [c:${citationIndex}].`
              : `No priced positions were found [c:${citationIndex}].`,
          );
        } else if (r.name === "list_anomalies") {
          const rows = (parsed.anomalies ?? []) as Array<{ title: string }>;
          parts.push(
            rows.length
              ? `There are ${rows.length} open findings; the most recent is "${rows[0]!.title}" [c:${citationIndex}].`
              : `No open anomalies right now [c:${citationIndex}].`,
          );
        } else if (r.name === "get_snapshot_series") {
          const points = (parsed.points ?? []) as Array<{ asOf: string; totalValue: string | null }>;
          const last = points.at(-1);
          parts.push(
            last
              ? `As of ${last.asOf} the portfolio value was ${last.totalValue} [c:${citationIndex}].`
              : `No snapshot history is available yet [c:${citationIndex}].`,
          );
        } else if (r.name === "query_transactions") {
          const rows = (parsed.rows ?? []) as Array<{ date: string; amount: string; description: string }>;
          parts.push(
            rows.length
              ? `The most recent matching transaction is ${rows[0]!.date}, ${rows[0]!.amount} ("${rows[0]!.description}") [c:${citationIndex}].`
              : `No transactions matched [c:${citationIndex}].`,
          );
        }
        if (parsed.truncated === true) {
          parts.push("Note: this result was truncated.");
        }
      }
      if (parts.length === 0) {
        parts.push(REFUSAL_UNGROUNDED);
      }
      return {
        kind: "text",
        tokens: tokenize(parts.join(" ")),
        usage: { in: 800, out: 150 },
      };
    },
  };
}

// ── Real transport (OpenAI chat completions w/ tools; smoke-tested when a key exists) ──
function createOpenAiTransport(): Transport {
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1";
  return {
    model,
    async turn({ messages, tools, maxOutputTokens }) {
      const body = {
        model,
        max_tokens: maxOutputTokens,
        parallel_tool_calls: true,
        tools: tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
        messages: messages.map((m) =>
          m.role === "tool"
            ? { role: "tool", tool_call_id: m.toolCallId, content: m.content }
            : { role: m.role, content: m.content },
        ),
      };
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000), // §07.8 stream-start budget
      });
      if (!res.ok) {
        throw new UpstreamError(
          res.status === 429
            ? "High demand — retry in a moment."
            : "The AI service is unavailable right now.",
        );
      }
      const json = (await res.json()) as {
        choices: Array<{
          message: {
            content: string | null;
            tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
          };
        }>;
        usage: { prompt_tokens: number; completion_tokens: number };
      };
      const choice = json.choices[0]!.message;
      if (choice.tool_calls?.length) {
        return {
          kind: "tool_calls",
          calls: choice.tool_calls.map((c) => ({
            id: c.id,
            name: c.function.name,
            args: JSON.parse(c.function.arguments || "{}"),
          })),
        };
      }
      return {
        kind: "text",
        tokens: tokenize(choice.content ?? ""),
        usage: { in: json.usage.prompt_tokens, out: json.usage.completion_tokens },
      };
    },
  };
}

export function getTransport(): Transport {
  return openAiIsMocked ? createMockTransport() : createOpenAiTransport();
}
