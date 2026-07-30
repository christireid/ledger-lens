import "server-only";

import { and, desc, eq, inArray, isNull, sql as rawSql } from "drizzle-orm";

import type { Ctx } from "@/server/context";
import { notifications } from "@/server/db/schema";
import type { RlsDb } from "@/server/db/rls";
import { ForbiddenError } from "@/server/errors";

export async function listNotifications(ctx: Ctx, db: RlsDb, limit: number) {
  if (!ctx.can("anomalies:read")) throw new ForbiddenError();
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.workspaceId, ctx.workspaceId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  const [unread] = await db
    .select({ count: rawSql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.workspaceId, ctx.workspaceId), isNull(notifications.readAt)))
    .limit(1);
  return { rows, unreadCount: unread?.count ?? 0 };
}

export async function markRead(
  ctx: Ctx,
  db: RlsDb,
  input: { ids: string[] } | { all: true },
): Promise<number> {
  if (!ctx.can("anomalies:read")) throw new ForbiddenError();
  const base = and(
    eq(notifications.workspaceId, ctx.workspaceId),
    isNull(notifications.readAt),
  );
  const where =
    "all" in input ? base : and(base, inArray(notifications.id, input.ids));
  const rows = await db
    .update(notifications)
    .set({ readAt: ctx.clock() })
    .where(where)
    .returning({ id: notifications.id });
  return rows.length;
}
