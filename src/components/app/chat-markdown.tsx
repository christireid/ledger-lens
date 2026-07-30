"use client";

import * as React from "react";

/**
 * ChatMarkdown — §08.7-4/§04.6: assistant text renders through a sanitized
 * markdown SUBSET (paragraphs, **bold**, `code`, - lists). Raw HTML never
 * renders (everything is React text nodes); links are stripped to
 * "[external link removed]" unless they point at an in-app route; [c:N]
 * markers resolve inline to the matching citation chip (§08.5) — a marker
 * with no matching citation renders as plain text, never a fabricated chip.
 */

export type InlineCitation = { ord: number; label: string | null; refIds: string[]; kind: string };

function renderInline(
  text: string,
  citations: InlineCitation[],
  onOpenCitation: (c: InlineCitation) => void,
  keyPrefix: string,
): React.ReactNode[] {
  // Strip links first: markdown links keep their text; bare URLs are removed.
  const stripped = text
    .replace(/\[([^\]]*)\]\((\/app[^\s)]*)\)/g, "$1") // in-app links keep text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1 [external link removed]")
    .replace(/https?:\/\/\S+/g, "[external link removed]");

  const nodes: React.ReactNode[] = [];
  // Tokenize: [c:N] | **bold** | `code`
  const pattern = /\[c:(\d+)\]|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(stripped)) !== null) {
    if (match.index > last) nodes.push(stripped.slice(last, match.index));
    if (match[1] !== undefined) {
      const ord = Number(match[1]);
      const citation = citations.find((c) => c.ord === ord);
      if (citation) {
        nodes.push(
          <button
            key={`${keyPrefix}-c${ord}-${i}`}
            type="button"
            className="mx-0.5 inline-flex items-center rounded-full border bg-muted px-1.5 text-[11px] leading-5 hover:bg-accent"
            onClick={() => onOpenCitation(citation)}
            aria-label={`Evidence ${citation.ord}: ${citation.label ?? `${citation.refIds.length} rows`}, opens drawer`}
          >
            {ord}
          </button>,
        );
      } else {
        nodes.push(match[0]); // §08.5: never invent a chip
      }
    } else if (match[2] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`}>{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      nodes.push(
        <code key={`${keyPrefix}-k${i}`} className="rounded bg-muted px-1 font-mono text-[0.85em]">
          {match[3]}
        </code>,
      );
    }
    last = match.index + match[0].length;
    i += 1;
  }
  if (last < stripped.length) nodes.push(stripped.slice(last));
  return nodes;
}

export function ChatMarkdown({
  content,
  citations,
  onOpenCitation,
}: {
  content: string;
  citations: InlineCitation[];
  onOpenCitation: (c: InlineCitation) => void;
}) {
  const blocks = content.split(/\n{2,}/);
  return (
    <div className="space-y-2 text-sm">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => /^\s*[-*]\s+/.test(l) || l.trim() === "");
        if (isList && lines.some((l) => l.trim() !== "")) {
          return (
            <ul key={bi} className="list-disc space-y-1 pl-5">
              {lines
                .filter((l) => l.trim() !== "")
                .map((l, li) => (
                  <li key={li}>
                    {renderInline(l.replace(/^\s*[-*]\s+/, ""), citations, onOpenCitation, `${bi}-${li}`)}
                  </li>
                ))}
            </ul>
          );
        }
        return (
          <p key={bi} className="whitespace-pre-wrap">
            {renderInline(block, citations, onOpenCitation, String(bi))}
          </p>
        );
      })}
    </div>
  );
}
