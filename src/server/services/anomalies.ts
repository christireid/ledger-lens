import "server-only";

import { and, desc, eq, inArray, type SQL } from "drizzle-orm";

import type { AnomalyStatus } from "@/lib/schemas/enums";
import type { Ctx } from "@/server/context";
import { anomalies, transactions } from "@/server/db/schema";
import type { RlsDb } from "@/server/db/rls";
import { ForbiddenError, NotFoundError } from "@/server/errors";

export async function listAnomalies(
  ctx: Ctx,
  db: RlsDb,
  q: { status?: AnomalyStatus | undefined; severity?: "low" | "medium" | "high" | undefined; limit: number },
) {
  if (!ctx.can("anomalies:read")) throw new ForbiddenError();
  const conditions: SQL[] = [eq(anomalies.workspaceId, ctx.workspaceId)];
  if (q.status) conditions.push(eq(anomalies.status, q.status));
  if (q.severity) conditions.push(eq(anomalies.severity, q.severity));
  const rows = await db
    .select()
    .from(anomalies)
    .where(and(...conditions))
    .orderBy(desc(anomalies.severity), desc(anomalies.createdAt))
    .limit(q.limit);

  // §05.6: each card previews its first 3 evidence rows — one batched query.
  const previewIds = [...new Set(rows.flatMap((r) => r.evidenceTxIds.slice(0, 3)))];
  const previews = previewIds.length
    ? await db
        .select({
          id: transactions.id,
          date: transactions.date,
          amount: transactions.amount,
          currency: transactions.currency,
          description: transactions.description,
        })
        .from(transactions)
        .where(inArray(transactions.id, previewIds))
    : [];
  const byId = new Map(previews.map((p) => [p.id, p]));
  return rows.map((r) => ({
    ...r,
    evidencePreview: r.evidenceTxIds
      .slice(0, 3)
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined),
  }));
}

/** POST /anomalies/:id/status — triage audit fields (US-05). */
export async function setAnomalyStatus(
  ctx: Ctx,
  db: RlsDb,
  id: string,
  status: AnomalyStatus,
  note?: string,
) {
  if (!ctx.can("anomalies:triage")) throw new ForbiddenError();
  const [row] = await db
    .update(anomalies)
    .set({
      status,
      statusChangedBy: ctx.userId,
      statusChangedAt: ctx.clock(),
      ...(note !== undefined ? { triageNote: note } : {}),
    })
    .where(and(eq(anomalies.id, id), eq(anomalies.workspaceId, ctx.workspaceId)))
    .returning();
  if (!row) throw new NotFoundError();
  return row;
}

/** POST /anomalies/bulk-status — acknowledge-only (§05.6). */
export async function bulkAcknowledge(ctx: Ctx, db: RlsDb, ids: string[]) {
  if (!ctx.can("anomalies:triage")) throw new ForbiddenError();
  const rows = await db
    .update(anomalies)
    .set({
      status: "acknowledged",
      statusChangedBy: ctx.userId,
      statusChangedAt: ctx.clock(),
    })
    .where(and(eq(anomalies.workspaceId, ctx.workspaceId), inArray(anomalies.id, ids)))
    .returning({ id: anomalies.id });
  return rows.length;
}
