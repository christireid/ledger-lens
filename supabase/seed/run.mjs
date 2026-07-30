#!/usr/bin/env node
/**
 * Seed runner shell — M1 key output (§27.4). Orchestration frame for the
 * §15.7 demo seed: connect via DIRECT_URL, resolve/create the demo workspace,
 * clear is_demo rows, and hand off to the deterministic generator.
 *
 * The generator itself (fixed-PRNG demo dataset, §15.7) lands in M4 — until
 * then this runner fails loudly rather than pretending to seed (§27.2e).
 */
import postgres from "postgres";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("seed: DIRECT_URL (or DATABASE_URL) is not set (§23.4).");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

async function main() {
  // Frame step 1: verify migrations have been applied.
  const [{ ok }] = await sql`
    select exists (
      select 1 from information_schema.tables where table_name = 'workspaces'
    ) as ok`;
  if (!ok) {
    throw new Error("schema not migrated — run pnpm db:migrate first (§09.7)");
  }

  // Frame step 2: hand off to the deterministic generator (§15.7).
  const { generateDemoSeed } = await import("./demo-generator.mjs").catch(
    () => ({ generateDemoSeed: null }),
  );
  if (!generateDemoSeed) {
    throw new Error(
      "demo-generator not implemented yet — lands in M4 (15.7 demo seed generator). Failing loudly (§27.2e).",
    );
  }
  await generateDemoSeed(sql);
  console.log("seed: complete");
}

main()
  .catch((err) => {
    console.error(`seed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
