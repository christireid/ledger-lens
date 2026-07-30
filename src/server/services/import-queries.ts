import "server-only";

import { and, desc, eq } from "drizzle-orm";

import type { Ctx } from "@/server/context";
import { importBatches } from "@/server/db/schema";
import type { RlsDb } from "@/server/db/rls";
import { ForbiddenError, NotFoundError } from "@/server/errors";

export async function listBatches(ctx: Ctx, db: RlsDb, limit: number) {
  if (!ctx.can("transactions:read")) throw new ForbiddenError();
  return db
    .select()
    .from(importBatches)
    .where(eq(importBatches.workspaceId, ctx.workspaceId))
    .orderBy(desc(importBatches.createdAt))
    .limit(limit);
}

export async function getBatch(ctx: Ctx, db: RlsDb, id: string) {
  if (!ctx.can("transactions:read")) throw new ForbiddenError();
  const [row] = await db
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.id, id), eq(importBatches.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!row) throw new NotFoundError();
  return row;
}
