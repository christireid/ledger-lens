#!/usr/bin/env node
/**
 * db:reset — §23.3: drop + migrate + seed. NEVER runs against prod: refuses
 * when the URL is not local unless RESET_CONFIRM=1 (the preview CI leg sets
 * it; §23.5 preview reset). Order matches §23.5: reset → migrate → seed.
 */
import { spawnSync } from "node:child_process";
import postgres from "postgres";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("db:reset: DIRECT_URL/DATABASE_URL required (§23.4)");
  process.exit(1);
}
const local = /localhost|127\.0\.0\.1/.test(url);
if (!local && process.env.RESET_CONFIRM !== "1") {
  console.error("db:reset: refusing to reset a non-local database without RESET_CONFIRM=1 (§23.3 'never in prod')");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });
console.log("db:reset: dropping schema public…");
await sql.unsafe("drop schema public cascade; create schema public; grant all on schema public to public;");
await sql.end();

for (const [name, args] of [
  ["migrate", ["scripts/db-migrate.mjs"]],
  ["seed", ["scripts/db-seed.mjs"]],
]) {
  console.log(`db:reset: ${name}…`);
  const r = spawnSync("node", args, { stdio: "inherit", env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log("db:reset: done");
