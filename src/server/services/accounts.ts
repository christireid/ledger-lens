import "server-only";

import { and, eq, isNull , sql as rawSql } from "drizzle-orm";
import type { z } from "zod";

import type { AccountInputSchema, AccountPatchSchema } from "@/lib/schemas/api";
import type { Ctx } from "@/server/context";
import { accounts } from "@/server/db/schema";
import type { RlsDb } from "@/server/db/rls";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors";

export async function listAccounts(ctx: Ctx, db: RlsDb, includeArchived: boolean) {
  if (!ctx.can("transactions:read")) throw new ForbiddenError();
  const conditions = [eq(accounts.workspaceId, ctx.workspaceId)];
  if (!includeArchived) {
    conditions.push(isNull(accounts.archivedAt));
  }
  return db
    .select()
    .from(accounts)
    .where(and(...conditions))
    .orderBy(accounts.name);
}

export async function createAccount(
  ctx: Ctx,
  db: RlsDb,
  input: z.infer<typeof AccountInputSchema>,
) {
  if (!ctx.can("accounts:manage")) throw new ForbiddenError();
  try {
    const [row] = await db
      .insert(accounts)
      .values({ workspaceId: ctx.workspaceId, ...input })
      .returning();
    return row!;
  } catch (err) {
    if (isUniqueViolation(err)) {
      // §09.3 unique (workspace_id, lower(name)); §18.2: 23505 translated in-service
      throw new ConflictError("stale_state", "An account with this name already exists.");
    }
    throw err;
  }
}

export async function patchAccount(
  ctx: Ctx,
  db: RlsDb,
  id: string,
  patch: z.infer<typeof AccountPatchSchema>,
) {
  if (!ctx.can("accounts:manage")) throw new ForbiddenError();
  try {
    const [row] = await db
      .update(accounts)
      .set(patch)
      .where(and(eq(accounts.id, id), eq(accounts.workspaceId, ctx.workspaceId)))
      .returning();
    if (!row) throw new NotFoundError();
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError("stale_state", "An account with this name already exists.");
    }
    throw err;
  }
}

/**
 * §02.8-8 archive: rows never orphaned; queries exclude archived by default;
 * archive is reversible. §07.11-4: timestamps come from SQL now(), never the
 * app server's clock.
 */
export async function archiveAccount(
  ctx: Ctx,
  db: RlsDb,
  id: string,
  opts: { unarchive?: boolean } = {},
) {
  if (!ctx.can("accounts:manage")) throw new ForbiddenError();
  const [row] = await db
    .update(accounts)
    .set({ archivedAt: opts.unarchive ? null : rawSql`now()` })
    .where(and(eq(accounts.id, id), eq(accounts.workspaceId, ctx.workspaceId)))
    .returning();
  if (!row) throw new NotFoundError();
  return row;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "cause" in err &&
    typeof (err as { cause?: { code?: string } }).cause === "object" &&
    (err as { cause?: { code?: string } }).cause?.code === "23505"
  ) || (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505");
}

export { isUniqueViolation };
