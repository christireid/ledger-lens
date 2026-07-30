#!/usr/bin/env node
/**
 * Flag-age lint — §25.5. A flag flipped fully-on must carry a
 * `// flag-on: YYYY-MM-DD` marker; once that date is older than two release
 * cycles (60 days here — weekly cadence §25.6 with slack), the flag must be
 * removed or carry a dated `// flag-debt:` justification. Default-off flags
 * are skeleton gates and never age out.
 */
import { readFileSync } from "node:fs";

const src = readFileSync("src/lib/flags.ts", "utf8");
const MAX_AGE_DAYS = 60;
const failures = [];

for (const line of src.split("\n")) {
  const on = /^\s*(\w+):\s*true\b/.exec(line);
  if (!on) continue;
  const dated = /flag-on:\s*(\d{4}-\d{2}-\d{2})/.exec(line);
  if (!dated) {
    failures.push(`${on[1]}: enabled without a "// flag-on: YYYY-MM-DD" marker`);
    continue;
  }
  const age = (Date.now() - new Date(dated[1]).getTime()) / 86_400_000;
  if (age > MAX_AGE_DAYS && !/flag-debt:/.test(line)) {
    failures.push(
      `${on[1]}: fully-on for ${Math.round(age)}d (> ${MAX_AGE_DAYS}d) with no "// flag-debt:" justification — remove the flag (§25.5)`,
    );
  }
}

if (failures.length > 0) {
  console.error("flag-age check failed:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("flag-age ok — no aged fully-on flags");
