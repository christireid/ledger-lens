import { createHash } from "node:crypto";

import { z } from "zod";

import { moneyToString, type Money } from "@/lib/schemas";
import type {
  DetectorDef,
  DetectorInput,
  DetectorKey,
  Finding,
} from "@/server/engine/detect/types";

/**
 * Detector registry — §14.2/§14.3 (normative parameters). Pure, deterministic.
 * evidenceHash = sha256(sorted evidence ids + detectorKey + paramsHash).
 */

function evidenceHashOf(key: DetectorKey, ids: string[], params: unknown): string {
  const paramsHash = createHash("sha256")
    .update(JSON.stringify(params ?? {}))
    .digest("hex")
    .slice(0, 16);
  return createHash("sha256")
    .update([...ids].sort().join(",") + key + paramsHash)
    .digest("hex");
}

function capEvidence(ids: string[]): { ids: string[]; overflow: number } {
  if (ids.length <= 100) return { ids, overflow: 0 };
  return { ids: ids.slice(0, 100), overflow: ids.length - 100 };
}

const money = (m: Money) => moneyToString(m);

/** trigram similarity (pg_trgm-style) over normalized descriptions (§14.3 D1). */
export function trigramSimilarity(a: string, b: string): number {
  const grams = (s: string): Set<string> => {
    const padded = `  ${s.toLowerCase().replace(/[^a-z0-9 ]/g, "")} `;
    const set = new Set<string>();
    for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
    return set;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (ga.size === 0 && gb.size === 0) return 1;
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared++;
  const union = ga.size + gb.size - shared;
  return union === 0 ? 0 : shared / union;
}

// ── D1 duplicate_charge ───────────────────────────────────────────────────────
const d1Params = z.object({
  windowDays: z.number().int().min(1).max(7).default(3),
  minAmount: z.string().regex(/^\d+(\.\d{1,4})?$/).default("1"),
  similarity: z.number().min(0.5).max(1).default(0.85),
});
type D1Params = z.infer<typeof d1Params>;

const EXCLUDED_D1 = new Set(["buy", "sell", "dividend"]);

function runD1(input: DetectorInput, params: D1Params): Finding[] {
  const minAmountUnits = BigInt(Math.round(Number(params.minAmount) * 10_000));
  const candidates = input.transactions.filter(
    (t) =>
      !t.superseded &&
      !EXCLUDED_D1.has(t.type) &&
      (t.amount < 0n ? -t.amount : t.amount) >= (minAmountUnits < 10_000n ? 10_000n : minAmountUnits),
  );
  // Group by (account, amount) then pair within window + similarity; union-find
  // for transitive grouping (§14.3 D1).
  const byKey = new Map<string, typeof candidates>();
  for (const t of candidates) {
    const k = `${t.accountId} ${t.amount}`;
    const list = byKey.get(k) ?? [];
    list.push(t);
    byKey.set(k, list);
  }
  const findings: Finding[] = [];
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => (a.date < b.date ? -1 : 1));
    // union-find over pairs
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      const p = parent.get(x) ?? x;
      if (p === x) return x;
      const root = find(p);
      parent.set(x, root);
      return root;
    };
    const union = (a: string, b: string) => parent.set(find(a), find(b));
    let anyPair = false;
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!;
        const b = sorted[j]!;
        const dayDiff =
          (Date.parse(b.date) - Date.parse(a.date)) / 86_400_000;
        if (dayDiff > params.windowDays) break;
        if (trigramSimilarity(a.description ?? "", b.description ?? "") >= params.similarity) {
          union(a.id, b.id);
          anyPair = true;
        }
      }
    }
    if (!anyPair) continue;
    const clusters = new Map<string, string[]>();
    for (const t of sorted) {
      if (!parent.has(t.id) && ![...parent.values()].includes(t.id)) continue;
      const root = find(t.id);
      const list = clusters.get(root) ?? [];
      list.push(t.id);
      clusters.set(root, list);
    }
    for (const ids of clusters.values()) {
      if (ids.length < 2) continue;
      const sample = sorted.find((t) => t.id === ids[0])!;
      const abs = sample.amount < 0n ? -sample.amount : sample.amount;
      const severity = abs >= 1_000_000n ? "high" : "medium"; // $100 ×10⁴
      const { ids: capped, overflow } = capEvidence(ids);
      findings.push({
        detectorKey: "duplicate_charge",
        severity,
        title: `Possible duplicate charge: ${money(sample.amount as Money)} × ${ids.length}`,
        evidenceTxIds: capped,
        evidenceHash: evidenceHashOf("duplicate_charge", ids, params),
        explainInput: {
          amount: money(sample.amount as Money),
          description: sample.description,
          count: ids.length,
          overflow,
        },
      });
    }
  }
  return findings;
}

// ── D2 fee_spike ──────────────────────────────────────────────────────────────
const d2Params = z.object({
  sigma: z.number().min(1).max(4).default(2),
  minMonths: z.number().int().min(3).max(12).default(3),
});
type D2Params = z.infer<typeof d2Params>;

function runD2(input: DetectorInput, params: D2Params): Finding[] {
  const findings: Finding[] = [];
  const fees = input.transactions.filter((t) => t.type === "fee" && !t.superseded);
  const byAccount = new Map<string, typeof fees>();
  for (const t of fees) {
    const list = byAccount.get(t.accountId) ?? [];
    list.push(t);
    byAccount.set(t.accountId, list);
  }
  const currentMonth = input.asOf.slice(0, 7);
  for (const [accountId, list] of byAccount) {
    const monthly = new Map<string, { total: number; ids: string[] }>();
    for (const t of list) {
      const ym = t.date.slice(0, 7);
      const e = monthly.get(ym) ?? { total: 0, ids: [] };
      e.total += Math.abs(Number(t.amount)) / 10_000; // absolute per §13.4-3
      e.ids.push(t.id);
      monthly.set(ym, e);
    }
    // Evaluate every FULL month against its own trailing-6 baseline —
    // detectors are idempotent over all data, so historical spikes surface
    // regardless of when the run happens (§07.6 idempotency rule).
    const months = [...monthly.keys()].filter((ym) => ym < currentMonth).sort();
    for (let i = 0; i < months.length; i++) {
      const evalMonth = months[i]!;
      const trailing = months.slice(Math.max(0, i - 6), i);
      if (trailing.length < params.minMonths) continue; // §14.3 D2: abstain
      const values = trailing.map((ym) => monthly.get(ym)!.total);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance =
        values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
      const sd = Math.sqrt(variance);
      const evalTotal = monthly.get(evalMonth)!.total;
      if (evalTotal > mean + params.sigma * sd && evalTotal > mean) {
        const severe = evalTotal > mean + 3 * sd || evalTotal > 250;
        const ids = monthly.get(evalMonth)!.ids;
        const { ids: capped, overflow } = capEvidence(ids);
        findings.push({
          detectorKey: "fee_spike",
          severity: severe ? "high" : "medium",
          title: `Fee spike: $${evalTotal.toFixed(2)} in ${evalMonth} vs ~$${mean.toFixed(2)}/mo baseline`,
          evidenceTxIds: capped,
          evidenceHash: evidenceHashOf("fee_spike", ids, { ...params, accountId, month: evalMonth }),
          explainInput: { accountId, month: evalMonth, total: evalTotal.toFixed(2), mean: mean.toFixed(2), sd: sd.toFixed(2), overflow },
        });
      }
    }
  }
  return findings;
}

// ── D3 large_transaction ─────────────────────────────────────────────────────
const d3Params = z.object({
  threshold: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(), // fixed for user rules
});
type D3Params = z.infer<typeof d3Params>;

function runD3(input: DetectorInput, params: D3Params): Finding[] {
  const findings: Finding[] = [];
  const byAccount = new Map<string, EngineTxList>();
  type EngineTxList = Array<DetectorInput["transactions"][number]>;
  for (const t of input.transactions) {
    if (t.superseded) continue;
    const list = byAccount.get(t.accountId) ?? [];
    list.push(t);
    byAccount.set(t.accountId, list);
  }
  for (const [accountId, list] of byAccount) {
    let thresholdUnits: bigint;
    if (params.threshold) {
      thresholdUnits = BigInt(Math.round(Number(params.threshold) * 10_000));
    } else {
      // adaptive: max($5,000, p99 of trailing-365d |amounts|) — detector mode
      const cutoff = new Date(Date.parse(input.asOf) - 365 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const abs = list
        .filter((t) => t.date >= cutoff)
        .map((t) => (t.amount < 0n ? -t.amount : t.amount))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      const p99 = abs[Math.min(abs.length - 1, Math.floor(abs.length * 0.99))] ?? 0n;
      thresholdUnits = p99 > 50_000_000n ? p99 : 50_000_000n; // $5,000 ×10⁴
    }
    for (const t of list) {
      const abs = t.amount < 0n ? -t.amount : t.amount;
      if (abs >= thresholdUnits) {
        findings.push({
          detectorKey: "large_transaction",
          severity: abs >= thresholdUnits * 2n ? "high" : "medium",
          title: `Large transaction: ${money(t.amount as Money)} (${t.description || t.type})`,
          evidenceTxIds: [t.id],
          evidenceHash: evidenceHashOf("large_transaction", [t.id], params),
          explainInput: { accountId, amount: money(t.amount as Money), threshold: money(thresholdUnits as Money), description: t.description },
        });
      }
    }
  }
  return findings;
}

// ── D4 allocation_drift ──────────────────────────────────────────────────────
const d4Params = z.object({
  driftPp: z.number().min(1).max(50).default(5),
  baselineDays: z.number().int().min(30).max(365).default(90),
});
type D4Params = z.infer<typeof d4Params>;

function runD4(input: DetectorInput, params: D4Params): Finding[] {
  const series = input.snapshotSeries ?? [];
  const cutoff = new Date(Date.parse(input.asOf) - params.baselineDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const window = series.filter(
    (p) => p.asOf >= cutoff && p.asOf < input.asOf && p.equityPct !== null,
  );
  if (window.length < 10) return []; // abstain pre-baseline (§14.6)
  const current = series.find((p) => p.asOf === input.asOf)?.equityPct;
  if (current == null) return [];
  const sortedPct = window.map((p) => p.equityPct!).sort((a, b) => a - b);
  const median = sortedPct[Math.floor(sortedPct.length / 2)]!;
  const drift = Math.abs(current - median);
  if (drift <= params.driftPp) return [];
  // Evidence: top 10 contributing transactions by |amount| in the window.
  const contributors = input.transactions
    .filter((t) => !t.superseded && t.date >= cutoff && (t.type === "buy" || t.type === "sell"))
    .sort((a, b) => {
      const aa = a.amount < 0n ? -a.amount : a.amount;
      const bb = b.amount < 0n ? -b.amount : b.amount;
      return aa < bb ? 1 : aa > bb ? -1 : 0;
    })
    .slice(0, 10)
    .map((t) => t.id);
  return [
    {
      detectorKey: "allocation_drift",
      severity: drift > 15 ? "high" : "medium",
      title: `Equity allocation drifted ${drift.toFixed(1)} pp from its ${params.baselineDays}-day median`,
      evidenceTxIds: contributors,
      evidenceHash: evidenceHashOf("allocation_drift", contributors, { ...params, asOf: input.asOf }),
      explainInput: { current: current.toFixed(1), median: median.toFixed(1), driftPp: drift.toFixed(1) },
    },
  ];
}

// ── D5 data_integrity (system-only) ──────────────────────────────────────────
const d5Params = z.object({});
type D5Params = z.infer<typeof d5Params>;

function runD5(input: DetectorInput, params: D5Params): Finding[] {
  const findings: Finding[] = [];
  const s = input.snapshot;
  if (!s) return findings;
  if (s.rowFlags.length > 0) {
    const ids = s.rowFlags.map((f) => f.txId);
    const { ids: capped, overflow } = capEvidence(ids);
    findings.push({
      detectorKey: "data_integrity",
      severity: "medium",
      title: `${ids.length} transaction${ids.length === 1 ? "" : "s"} where amount disagrees with quantity × price`,
      evidenceTxIds: capped,
      evidenceHash: evidenceHashOf("data_integrity", ids, { kind: "inconsistent_amount", ...params }),
      explainInput: { kind: "inconsistent_amount", count: ids.length, overflow },
    });
  }
  const incomplete = s.positions.filter((p) => p.flags.includes("incomplete_history"));
  if (incomplete.length > 0) {
    const key = incomplete.map((p) => p.instrumentId);
    findings.push({
      detectorKey: "data_integrity",
      severity: "medium",
      title: `${incomplete.length} position${incomplete.length === 1 ? "" : "s"} with incomplete history (sold more than recorded)`,
      evidenceTxIds: [],
      evidenceHash: evidenceHashOf("data_integrity", key, { kind: "incomplete_history", ...params }),
      explainInput: { kind: "incomplete_history", instruments: key },
    });
  }
  if (s.orphanIncome.length > 0) {
    const key = s.orphanIncome.map((o) => o.instrumentId);
    findings.push({
      detectorKey: "data_integrity",
      severity: "medium",
      title: `Income recorded for ${s.orphanIncome.length} instrument${s.orphanIncome.length === 1 ? "" : "s"} never held`,
      evidenceTxIds: [],
      evidenceHash: evidenceHashOf("data_integrity", key, { kind: "orphan_income", ...params }),
      explainInput: { kind: "orphan_income", instruments: key },
    });
  }
  return findings;
}

// ── D6 account_inactivity (user-rule only) ───────────────────────────────────
const d6Params = z.object({
  days: z.number().int().min(7).max(365).default(45),
});
type D6Params = z.infer<typeof d6Params>;

function runD6(input: DetectorInput, params: D6Params): Finding[] {
  const lastByAccount = new Map<string, string>();
  for (const t of input.transactions) {
    if (t.superseded) continue;
    const prev = lastByAccount.get(t.accountId);
    if (!prev || t.date > prev) lastByAccount.set(t.accountId, t.date);
  }
  if (lastByAccount.size < 2) return []; // needs "other accounts active"
  const cutoff = new Date(Date.parse(input.asOf) - params.days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const activeElsewhere = [...lastByAccount.values()].some((d) => d >= cutoff);
  if (!activeElsewhere) return [];
  const findings: Finding[] = [];
  for (const [accountId, lastDate] of lastByAccount) {
    if (lastDate < cutoff) {
      findings.push({
        detectorKey: "account_inactivity",
        severity: "low",
        title: `No activity in this account since ${lastDate}`,
        evidenceTxIds: [],
        evidenceHash: evidenceHashOf("account_inactivity", [accountId, lastDate], params),
        explainInput: { accountId, lastDate, days: params.days },
      });
    }
  }
  return findings;
}

// ── Registry ─────────────────────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any -- heterogeneous registry, params typed per-entry */
export const detectorRegistry: Record<DetectorKey, DetectorDef<any>> = {
  duplicate_charge: {
    key: "duplicate_charge",
    paramsSchema: d1Params,
    defaultParams: d1Params.parse({}),
    userConfigurable: false, // detector-only in MVP (ALERT_TYPES excludes D1)
    run: runD1,
    explainTemplate: (f) =>
      `Found ${f.explainInput.count as number} charges of ${f.explainInput.amount as string} with matching descriptions within a few days of each other. This pattern often indicates a duplicate billing.`,
  },
  fee_spike: {
    key: "fee_spike",
    paramsSchema: d2Params,
    defaultParams: d2Params.parse({}),
    userConfigurable: true,
    run: runD2,
    explainTemplate: (f) =>
      `Fees in ${f.explainInput.month as string} totaled $${f.explainInput.total as string}, well above the ~$${f.explainInput.mean as string} monthly baseline.`,
  },
  large_transaction: {
    key: "large_transaction",
    paramsSchema: d3Params,
    defaultParams: d3Params.parse({}),
    userConfigurable: true,
    run: runD3,
    explainTemplate: (f) =>
      `A transaction of ${f.explainInput.amount as string} exceeded the ${f.explainInput.threshold as string} threshold for this account.`,
  },
  allocation_drift: {
    key: "allocation_drift",
    paramsSchema: d4Params,
    defaultParams: d4Params.parse({}),
    userConfigurable: true,
    run: runD4,
    explainTemplate: (f) =>
      `Equity allocation is ${f.explainInput.current as string}%, ${f.explainInput.driftPp as string} percentage points away from its recent median of ${f.explainInput.median as string}%.`,
  },
  data_integrity: {
    key: "data_integrity",
    paramsSchema: d5Params,
    defaultParams: {},
    userConfigurable: false,
    run: runD5,
    explainTemplate: (f) => {
      const kind = f.explainInput.kind as string;
      if (kind === "inconsistent_amount")
        return "Some rows have amounts that disagree with quantity × price beyond normal rounding.";
      if (kind === "incomplete_history")
        return "Some positions were sold in greater quantity than the imported history shows being bought — earlier records are likely missing.";
      return "Income was recorded for instruments with no recorded holdings.";
    },
  },
  account_inactivity: {
    key: "account_inactivity",
    paramsSchema: d6Params,
    defaultParams: d6Params.parse({}),
    userConfigurable: true,
    run: runD6,
    explainTemplate: (f) =>
      `This account has had no activity since ${f.explainInput.lastDate as string} while other accounts remained active — its import feed may have gone stale.`,
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export { evidenceHashOf };
