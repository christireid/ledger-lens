import type { QueryKey } from "@tanstack/react-query";

/**
 * Query key factory — §06.5.1: ALL keys come from here; hand-written keys are
 * lint-banned (arch-grep). normalize() sorts keys + drops defaults so
 * semantically equal filters share a cache entry.
 */

export function normalize(filter: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(filter).sort()) {
    const value = filter[key];
    if (value === undefined || value === null || value === "" || value === false) continue;
    out[key] = value;
  }
  return out;
}

export const qk = {
  dashboard: (range: string) => ["dashboard", range] as const,
  transactions: (f: Record<string, unknown>) => ["transactions", normalize(f)] as const,
  transaction: (id: string) => ["transactions", "detail", id] as const,
  accounts: (includeArchived: boolean) => ["accounts", includeArchived] as const,
  series: (range: string) => ["series", range] as const,
  anomalies: (s: string) => ["anomalies", s] as const,
  investigations: () => ["investigations"] as const,
  investigation: (id: string) => ["investigations", id] as const,
  alerts: () => ["alerts"] as const,
  notifications: () => ["notifications"] as const,
  imports: () => ["imports"] as const,
  importBatch: (id: string) => ["imports", id] as const,
  workspace: () => ["workspace"] as const,
} satisfies Record<string, (...args: never[]) => QueryKey>;
