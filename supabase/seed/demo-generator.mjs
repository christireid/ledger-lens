/**
 * DB writer for the §15.7 demo dataset. Invoked by run.mjs with an open
 * postgres.js handle. Idempotent: clears is_demo workspace rows and reseeds
 * (§09.8: reseed = delete where is_demo + rerun).
 */
import { randomUUID } from "node:crypto";

import { generateDemoDataset } from "./demo-dataset.mjs";

export async function generateDemoSeed(sql) {
  const dataset = generateDemoDataset();
  const clerkUserId = process.env.DEMO_CLERK_USER_ID ?? "demo_user";

  await sql.begin(async (tx) => {
    // Reseed: remove the previous demo workspace for this user (cascades).
    await tx`delete from workspaces where clerk_user_id = ${clerkUserId} and is_demo`;

    const workspaceId = process.env.DEMO_WORKSPACE_ID ?? randomUUID();
    await tx`
      insert into workspaces (id, clerk_user_id, name, is_demo, base_currency)
      values (${workspaceId}, ${clerkUserId}, ${"Demo workspace"}, true, 'USD')`;

    const accountIds = {};
    for (const account of dataset.accounts) {
      const [row] = await tx`
        insert into accounts (workspace_id, name, type, institution, currency)
        values (${workspaceId}, ${account.name}, ${account.type}, ${account.institution}, ${account.currency})
        returning id`;
      accountIds[account.key] = row.id;
    }

    const instrumentIds = {};
    for (const inst of dataset.instruments) {
      const [row] = await tx`
        insert into instruments (symbol, kind, name, currency)
        values (${inst.symbol}, ${inst.kind}, ${inst.name}, ${inst.currency})
        on conflict (symbol, kind) do update set name = excluded.name
        returning id`;
      instrumentIds[inst.symbol] = row.id;
    }

    const [batch] = await tx`
      insert into import_batches (workspace_id, file_name, content_hash, status, stats)
      values (${workspaceId}, 'demo-seed', ${`demo-${dataset.version}`}, 'committed',
              ${JSON.stringify({ accepted: dataset.transactions.length, rejected: 0, duplicates: 0 })})
      returning id`;

    let line = 0;
    for (const t of dataset.transactions) {
      line += 1;
      await tx`
        insert into transactions
          (workspace_id, account_id, import_batch_id, source_line, date, type,
           amount, currency, instrument_id, quantity, price, description)
        values
          (${workspaceId}, ${accountIds[t.accountKey]}, ${batch.id}, ${line},
           ${t.date}, ${t.type}, ${t.amount}, ${t.currency},
           ${t.symbol ? instrumentIds[t.symbol] : null},
           ${t.quantity ?? null}, ${t.price ?? null}, ${t.description})`;
    }
    console.log(
      `seed: workspace ${workspaceId} — ${dataset.transactions.length} transactions, version ${dataset.version}`,
    );
  });
}
