import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import type { Ctx } from "@/server/context";
import { aiEvalLog, investigations, messageCitations, messages } from "@/server/db/schema";
import type { RlsDb } from "@/server/db/rls";
import { ForbiddenError, NotFoundError } from "@/server/errors";

export async function listInvestigations(ctx: Ctx, db: RlsDb) {
  if (!ctx.can("investigations:use")) throw new ForbiddenError();
  return db
    .select()
    .from(investigations)
    .where(eq(investigations.workspaceId, ctx.workspaceId))
    .orderBy(desc(investigations.updatedAt));
}

export async function createInvestigation(ctx: Ctx, db: RlsDb) {
  if (!ctx.can("investigations:use")) throw new ForbiddenError();
  const [row] = await db
    .insert(investigations)
    .values({ workspaceId: ctx.workspaceId, title: "New investigation" })
    .returning();
  return row!;
}

export async function getInvestigation(ctx: Ctx, db: RlsDb, id: string) {
  if (!ctx.can("investigations:use")) throw new ForbiddenError();
  const [row] = await db
    .select()
    .from(investigations)
    .where(and(eq(investigations.id, id), eq(investigations.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!row) throw new NotFoundError();
  const thread = await db
    .select()
    .from(messages)
    .where(eq(messages.investigationId, id))
    .orderBy(asc(messages.createdAt));
  const citations = thread.length
    ? await db
        .select()
        .from(messageCitations)
        .where(eq(messageCitations.workspaceId, ctx.workspaceId))
    : [];
  return { investigation: row, messages: thread, citations };
}

export async function patchInvestigation(ctx: Ctx, db: RlsDb, id: string, title: string) {
  if (!ctx.can("investigations:use")) throw new ForbiddenError();
  const [row] = await db
    .update(investigations)
    .set({ title })
    .where(and(eq(investigations.id, id), eq(investigations.workspaceId, ctx.workspaceId)))
    .returning();
  if (!row) throw new NotFoundError();
  return row;
}

export async function deleteInvestigation(ctx: Ctx, db: RlsDb, id: string) {
  if (!ctx.can("investigations:use")) throw new ForbiddenError();
  const rows = await db
    .delete(investigations)
    .where(and(eq(investigations.id, id), eq(investigations.workspaceId, ctx.workspaceId)))
    .returning({ id: investigations.id });
  if (rows.length === 0) throw new NotFoundError();
}

/** POST /messages/:id/feedback — 204; writes ai_eval_log (§08.9). */
export async function recordFeedback(
  ctx: Ctx,
  db: RlsDb,
  messageId: string,
  value: 1 | -1,
) {
  if (!ctx.can("investigations:use")) throw new ForbiddenError();
  const [message] = await db
    .select({ id: messages.id, model: messages.model, promptVersion: messages.promptVersion })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!message) throw new NotFoundError();
  await db.insert(aiEvalLog).values({
    workspaceId: ctx.workspaceId,
    messageId,
    model: message.model,
    promptVersion: message.promptVersion,
    feedback: value,
  });
}
