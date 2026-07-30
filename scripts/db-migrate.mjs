#!/usr/bin/env node
// Apply supabase/migrations via drizzle-kit (§09.7, §23.6).
// Uses DIRECT_URL (session mode) — never the transaction-mode pooler.
import { spawnSync } from "node:child_process";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error(
    "db:migrate: DIRECT_URL (or DATABASE_URL) is not set — cannot apply migrations (§23.4).",
  );
  process.exit(1);
}

const result = spawnSync("pnpm", ["drizzle-kit", "migrate"], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
