#!/usr/bin/env node
// Bundle budget enforcement — §20.3/§20.11. Parses the Next build manifest and
// sums gzipped client-chunk sizes per route; fails CI over ceiling, warns ≥90%.
import { readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const budgets = JSON.parse(readFileSync("perf-budgets.json", "utf8"));
const manifest = JSON.parse(readFileSync(".next/app-build-manifest.json", "utf8"));

function gzippedKb(files) {
  let total = 0;
  for (const f of files) {
    if (!f.endsWith(".js")) continue;
    const p = path.join(".next", f);
    try {
      statSync(p);
      total += gzipSync(readFileSync(p)).length;
    } catch {
      /* chunk emitted under a different root — skip */
    }
  }
  return total / 1024;
}

const routeToPage = (route) => (route === "/" ? "/page" : `${route}/page`);
// Route groups like (marketing) are invisible in the URL — strip them.
const normalize = (key) => key.replace(/\/\([^)]+\)/g, "");

let failed = false;

// §20.3: the shared baseline (chunks every route loads) has its own ceiling.
if (budgets.sharedBaselineKb) {
  const shared = new Set(
    Object.values(manifest.pages).reduce((acc, files) => {
      if (acc === null) return [...files];
      return acc.filter((f) => files.includes(f));
    }, null) ?? [],
  );
  const sharedKb = gzippedKb([...shared]);
  const line = `shared baseline: ${sharedKb.toFixed(1)}KB gz / ${budgets.sharedBaselineKb}KB ceiling`;
  if (sharedKb > budgets.sharedBaselineKb) {
    console.error(`size FAIL ${line}`);
    failed = true;
  } else {
    console.log(`size ok   ${line}`);
  }
}

for (const [route, ceilingKb] of Object.entries(budgets.routes)) {
  const key = Object.keys(manifest.pages).find((p) => normalize(p) === routeToPage(route));
  if (!key) {
    console.error(`size: route ${route} not found in build manifest`);
    failed = true;
    continue;
  }
  const kb = gzippedKb(manifest.pages[key]);
  const ratio = kb / ceilingKb;
  const line = `${route}: ${kb.toFixed(1)}KB gz / ${ceilingKb}KB ceiling (${(ratio * 100).toFixed(0)}%)`;
  if (ratio > 1) {
    console.error(`size FAIL ${line}`);
    failed = true;
  } else if (ratio >= budgets.warnAtRatio) {
    console.warn(`size WARN ${line}`);
  } else {
    console.log(`size ok   ${line}`);
  }
}
process.exit(failed ? 1 : 0);
