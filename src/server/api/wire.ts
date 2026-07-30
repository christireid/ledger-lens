import "server-only";

import { toPublicId } from "@/lib/public-ids";
import type {
  accounts,
  alertRules,
  anomalies,
  importBatches,
  investigations,
  messageCitations,
  messages,
  notifications,
  transactions,
  workspaces,
} from "@/server/db/schema";

/**
 * Wire serialization — §17.1: prefixed public IDs, money as decimal strings
 * (numeric columns already surface as strings via postgres.js), dates as
 * YYYY-MM-DD. This module is the only place public IDs are minted.
 */

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];

export function txToWire(tx: Row<typeof transactions>, symbol: string | null) {
  return {
    id: toPublicId("transaction", tx.id),
    accountId: toPublicId("account", tx.accountId),
    batchId: toPublicId("batch", tx.importBatchId),
    date: tx.date,
    type: tx.type,
    amount: tx.amount,
    currency: tx.currency.trim(),
    symbol,
    quantity: tx.quantity,
    price: tx.price,
    description: tx.description,
    sourceLine: tx.sourceLine,
    supersedesId: tx.supersedesId ? toPublicId("transaction", tx.supersedesId) : null,
    superseded: tx.superseded,
    createdAt: tx.createdAt.toISOString(),
  };
}

export function accountToWire(a: Row<typeof accounts>) {
  return {
    id: toPublicId("account", a.id),
    name: a.name,
    type: a.type,
    institution: a.institution,
    currency: a.currency.trim(),
    archivedAt: a.archivedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

export function anomalyToWire(
  a: Row<typeof anomalies> & {
    evidencePreview?: Array<{ id: string; date: string; amount: string; currency: string; description: string | null }>;
  },
) {
  return {
    id: toPublicId("anomaly", a.id),
    evidencePreview: (a.evidencePreview ?? []).map((p) => ({
      id: toPublicId("transaction", p.id),
      date: p.date,
      amount: p.amount,
      currency: p.currency,
      description: p.description,
    })),
    type: a.type,
    severity: a.severity,
    status: a.status,
    title: a.title,
    explanation: a.explanation,
    evidenceTxIds: a.evidenceTxIds.map((id) => toPublicId("transaction", id)),
    detectedBatchId: a.detectedBatchId ? toPublicId("batch", a.detectedBatchId) : null,
    statusChangedAt: a.statusChangedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

export function alertRuleToWire(r: Row<typeof alertRules>) {
  return {
    id: toPublicId("alertRule", r.id),
    type: r.type,
    name: r.name,
    params: r.params,
    enabled: r.enabled,
    lastTriggeredAt: r.lastTriggeredAt?.toISOString() ?? null,
    triggerCount: r.triggerCount,
    createdAt: r.createdAt.toISOString(),
  };
}

export function notificationToWire(n: Row<typeof notifications>) {
  return {
    id: toPublicId("notification", n.id),
    alertRuleId: n.alertRuleId ? toPublicId("alertRule", n.alertRuleId) : null,
    title: n.title,
    body: n.body,
    evidence: n.evidence,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

export function investigationToWire(i: Row<typeof investigations>) {
  return {
    id: toPublicId("investigation", i.id),
    title: i.title,
    summary: i.summary,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

export function messageToWire(
  m: Row<typeof messages>,
  citations: Array<Row<typeof messageCitations>>,
) {
  return {
    id: toPublicId("message", m.id),
    role: m.role,
    content: m.content,
    stopped: m.stopped,
    model: m.model,
    createdAt: m.createdAt.toISOString(),
    citations: citations
      .sort((a, b) => a.ord - b.ord)
      .map((c) => ({
        ord: c.ord,
        kind: c.kind,
        refIds: c.refIds.map((id) => toPublicId("transaction", id)),
        label: c.label,
      })),
  };
}

export function batchToWire(b: Row<typeof importBatches>) {
  return {
    id: toPublicId("batch", b.id),
    fileName: b.fileName,
    status: b.status,
    stats: b.stats,
    error: b.error,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

export function workspaceToWire(w: Row<typeof workspaces>) {
  return {
    id: toPublicId("workspace", w.id),
    name: w.name,
    isDemo: w.isDemo,
    baseCurrency: w.baseCurrency.trim(),
    createdAt: w.createdAt.toISOString(),
  };
}
