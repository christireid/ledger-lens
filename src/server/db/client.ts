import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/server/env";
import * as schema from "@/server/db/schema";

/**
 * Database access — §07.3. postgres.js via the Supabase transaction-mode
 * pooler (port 6543); prepare: false is REQUIRED (transaction-mode pooling is
 * incompatible with prepared statements).
 */
function createClient() {
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not configured — database features unavailable (§07.9; see DECISIONS.md operator-config entry)",
    );
  }
  const sql = postgres(env.DATABASE_URL, {
    prepare: false,
    max: 10,
  });
  return drizzle(sql, { schema });
}

type Db = ReturnType<typeof createClient>;

let _db: Db | null = null;

/** Lazy singleton — modules can import without forcing a connection at build time. */
export function getDb(): Db {
  _db ??= createClient();
  return _db;
}

export { schema };
