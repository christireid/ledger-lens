#!/usr/bin/env node
// Demo seed entrypoint (§23.3) — delegates to the seed runner shell.
import { spawnSync } from "node:child_process";

const result = spawnSync("node", ["supabase/seed/run.mjs"], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
