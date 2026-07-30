import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { workspaces } from "@/server/db/schema";
import { adminDb, withRls } from "@/server/db/rls";
import {
  deleteWorkspaceForUser,
  resolveWorkspace,
} from "@/server/services/workspace";

/**
 * Bootstrap race test — §10.8: N concurrent first requests create exactly one
 * workspace. Runs with RLS active (app_user + jwt claims), i.e. the exact
 * production path.
 */

const userId = `race_user_${randomUUID().slice(0, 8)}`;

afterAll(async () => {
  await adminDb().delete(workspaces).where(eq(workspaces.clerkUserId, userId));
});

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error("integration tests require DATABASE_URL (§23.4)");
  }
});

describe("workspace bootstrap (§10.4)", () => {
  it("N=12 concurrent first requests create exactly one workspace", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        withRls(userId, (db) => resolveWorkspace(db, userId)),
      ),
    );

    const ids = new Set(results.map((r) => r.workspaceId));
    expect(ids.size).toBe(1);
    expect(results.every((r) => r.role === "owner")).toBe(true);

    const rows = await adminDb()
      .select()
      .from(workspaces)
      .where(eq(workspaces.clerkUserId, userId));
    expect(rows).toHaveLength(1);
  });

  it("subsequent resolution is a plain select (bootstrapped=false)", async () => {
    const again = await withRls(userId, (db) => resolveWorkspace(db, userId));
    expect(again.bootstrapped).toBe(false);
  });

  it("deleteWorkspaceForUser is idempotent (§10.7-3)", async () => {
    const ghost = `ghost_${randomUUID().slice(0, 8)}`;
    const first = await deleteWorkspaceForUser(adminDb(), ghost);
    expect(first.deleted).toBe(false); // no-op delete of never-bootstrapped user
  });
});
