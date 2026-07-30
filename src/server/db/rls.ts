import "server-only";

import { sql as rawSql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/server/db/schema";
import { env } from "@/server/env";

/**
 * Clerk–Supabase RLS bridge — §10.5. The claim wiring lives ONLY here (the db
 * handle factory) so services are unaware of it. Every scoped operation runs
 * inside a transaction as app_user with request.jwt.claims set locally —
 * auth.jwt()->>'sub' powers the §09.6 policies on Supabase and on the local
 * stack alike. If the wiring breaks, RLS returns zero rows — visible, never a
 * cross-tenant leak.
 */

let _root: PostgresJsDatabase<typeof schema> | null = null;

function root(): PostgresJsDatabase<typeof schema> {
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not configured — database features unavailable (§07.9)",
    );
  }
  if (!_root) {
    const client = postgres(env.DATABASE_URL, { prepare: false, max: 10 });
    _root = drizzle(client, { schema });
  }
  return _root;
}

type TxDb = Parameters<
  Parameters<PostgresJsDatabase<typeof schema>["transaction"]>[0]
>[0];

/** Service-facing db handle: an RLS transaction or the admin root (webhooks). */
export type RlsDb = TxDb | PostgresJsDatabase<typeof schema>;

/**
 * Run `fn` with RLS active for the given Clerk user. All service data access
 * goes through this seam. SET LOCAL scopes role+claims to the transaction, so
 * pooled connections never leak identity across requests.
 */
export async function withRls<T>(
  clerkUserId: string,
  fn: (db: RlsDb) => Promise<T>,
): Promise<T> {
  const claims = JSON.stringify({ sub: clerkUserId });
  return root().transaction(async (tx) => {
    await tx.execute(
      rawSql`select set_config('request.jwt.claims', ${claims}, true)`,
    );
    await tx.execute(rawSql`set local role app_user`);
    // §09.5: the 5 s ceiling must hold on THIS session — role-level GUCs only
    // apply at login as app_user, and the pooled connection logs in as the
    // service role, so the timeout is pinned per-transaction here.
    await tx.execute(rawSql`set local statement_timeout = '5s'`);
    return fn(tx);
  });
}

/** Admin (RLS-bypassing) handle — migrations, webhooks cascade delete (§10.2). */
export function adminDb(): PostgresJsDatabase<typeof schema> {
  return root();
}
