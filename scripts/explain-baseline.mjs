#!/usr/bin/env node
/**
 * EXPLAIN gate — §20.5/§09.10. Records the plan shape (node types + indexes
 * used) for the hot queries: the ledger default read, the snapshot-series
 * read, and the §13 aggregates. `--record` writes scripts/explain-baselines.json;
 * default mode re-plans and fails on drift (a lost index scan or a changed
 * index). enable_seqscan is disabled for planning so the assertion is about
 * whether the index CAN serve the query — table size at gate time is
 * irrelevant (CI databases are small).
 */
import { readFileSync, writeFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("explain-baseline: DATABASE_URL/DIRECT_URL required");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1 });

const WS = "00000000-0000-0000-0000-000000000000";
const QUERIES = {
  "ledger-default": `
    select * from transactions
    where workspace_id = '${WS}' and not superseded
    order by date desc, created_at desc limit 50`,
  "ledger-search": `
    select * from transactions
    where workspace_id = '${WS}' and not superseded
      and to_tsvector('simple', immutable_unaccent(description)) @@ to_tsquery('simple', 'netflix:*')
    limit 50`,
  "snapshot-series": `
    select as_of, total_value, cash_value from portfolio_snapshots
    where workspace_id = '${WS}' and as_of >= '2026-01-01' and as_of <= '2026-07-01'
    order by as_of`,
  "aggregate-period": `
    select currency, sum(amount) from transactions
    where workspace_id = '${WS}' and not superseded
      and date >= '2026-01-01' and date <= '2026-07-01'
      and type in ('dividend','interest')
    group by currency`,
  "aggregate-fees": `
    select to_char(date, 'YYYY-MM'), -sum(amount) from transactions
    where workspace_id = '${WS}' and not superseded and type = 'fee'
    group by 1`,
  "anomaly-queue": `
    select * from anomalies
    where workspace_id = '${WS}' and status = 'open'
    order by created_at desc limit 50`,
};

function walk(node, out) {
  const type = node["Node Type"];
  if (/Index/.test(type ?? "")) {
    out.push({ node: type, index: node["Index Name"] ?? null });
  }
  for (const child of node.Plans ?? []) walk(child, out);
}

const results = {};
for (const [name, query] of Object.entries(QUERIES)) {
  const plan = await sql.begin(async (tx) => {
    await tx.unsafe("set local enable_seqscan = off");
    const rows = await tx.unsafe(`explain (format json) ${query}`);
    return rows[0]["QUERY PLAN"][0].Plan;
  });
  const indexNodes = [];
  walk(plan, indexNodes);
  results[name] = indexNodes;
  if (indexNodes.length === 0) {
    console.error(`explain FAIL ${name}: no index scan in plan — the query would seq-scan at size`);
    await sql.end();
    process.exit(1);
  }
}

await sql.end();

const baselinePath = "scripts/explain-baselines.json";
if (process.argv.includes("--record")) {
  writeFileSync(baselinePath, JSON.stringify(results, null, 2) + "\n");
  console.log(`explain: baseline recorded to ${baselinePath}`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
} catch {
  console.error(`explain FAIL: no baseline at ${baselinePath} — run with --record first`);
  process.exit(1);
}
let failed = false;
for (const [name, nodes] of Object.entries(results)) {
  const expected = JSON.stringify(baseline[name] ?? null);
  const actual = JSON.stringify(nodes);
  if (expected !== actual) {
    console.error(`explain DRIFT ${name}:\n  baseline: ${expected}\n  actual:   ${actual}`);
    failed = true;
  } else {
    console.log(`explain ok ${name}: ${nodes.map((n) => n.index).join(", ")}`);
  }
}
process.exit(failed ? 1 : 0);
