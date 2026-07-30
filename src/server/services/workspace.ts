import "server-only";

import { eq } from "drizzle-orm";

import { WorkspaceIdSchema, type WorkspaceId } from "@/lib/schemas";
import { workspaces } from "@/server/db/schema";
import type { RlsDb } from "@/server/db/rls";

/**
 * Workspace resolution & bootstrap — §10.4. Lazy bootstrap on first
 * authenticated data access: select by clerk_user_id; on miss, race-safe
 * upsert (§09.9-6: insert on conflict do nothing + re-select). Exactly one
 * workspace per user is guaranteed by the unique constraint, not by luck.
 */

export type ResolvedWorkspace = {
  workspaceId: WorkspaceId;
  role: "owner"; // §10.9 seam: hardcoded today, membership table later
  isDemo: boolean;
  bootstrapped: boolean;
};

export async function resolveWorkspace(
  db: RlsDb,
  clerkUserId: string,
  opts: { demoIntent?: boolean; name?: string } = {},
): Promise<ResolvedWorkspace> {
  const existing = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.clerkUserId, clerkUserId))
    .limit(1);

  const first = existing[0];
  if (first) {
    return {
      workspaceId: WorkspaceIdSchema.parse(first.id),
      role: "owner",
      isDemo: first.isDemo,
      bootstrapped: false,
    };
  }

  // Miss: race-safe upsert. Concurrent first requests all reach here; the
  // unique constraint on clerk_user_id lets exactly one insert win.
  await db
    .insert(workspaces)
    .values({
      clerkUserId,
      name: opts.name ?? "My workspace",
      isDemo: opts.demoIntent ?? false,
    })
    .onConflictDoNothing({ target: workspaces.clerkUserId });

  const after = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.clerkUserId, clerkUserId))
    .limit(1);

  const row = after[0];
  if (!row) {
    // RLS misconfiguration would surface here as zero rows (§10.5 failure mode).
    throw new Error(
      "workspace bootstrap failed: row invisible after upsert (RLS wiring? §10.5)",
    );
  }

  return {
    workspaceId: WorkspaceIdSchema.parse(row.id),
    role: "owner",
    isDemo: row.isDemo,
    bootstrapped: true,
  };
}

/** §09.8 / §10.2: user.deleted → single-transaction cascade delete. Idempotent. */
export async function deleteWorkspaceForUser(
  db: RlsDb,
  clerkUserId: string,
): Promise<{ deleted: boolean }> {
  const result = await db
    .delete(workspaces)
    .where(eq(workspaces.clerkUserId, clerkUserId))
    .returning({ id: workspaces.id });
  return { deleted: result.length > 0 };
}
