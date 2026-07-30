import "server-only";

import { sql as rawSql } from "drizzle-orm";

import type { MarketDate, WorkspaceId } from "@/lib/schemas";
import { buildCtx, type Ctx } from "@/server/context";
import { adminDb, withRls } from "@/server/db/rls";
import type { RlsDb } from "@/server/db/rls";
import { detectorRegistry } from "@/server/engine/detect/registry";
import type { DetectorKey, Finding } from "@/server/engine/detect/types";
import { loadDetectorInput } from "@/server/services/detection";
import { recomputeSnapshots } from "@/server/services/snapshots";

/**
 * Nightly job — §07.6: snapshot recompute + alert evaluation for every
 * workspace; idempotent (computes from ledger state, never increments).
 * Detector failures are isolated per-detector (§14.5-3).
 */

export async function runDetectorsForWorkspace(
  ctx: Ctx,
  db: RlsDb,
  asOf: MarketDate,
  opts: { includeNightlyOnly: boolean },
): Promise<{ findings: number; inserted: number; notified: number; failures: string[] }> {
  const input = await loadDetectorInput(ctx, db, asOf);
  const failures: string[] = [];
  const findings: Finding[] = [];

  // System anomaly detectors with default params. D4 is nightly-only (§14.3).
  const systemKeys: DetectorKey[] = [
    "duplicate_charge",
    "fee_spike",
    "large_transaction",
    "data_integrity",
    ...(opts.includeNightlyOnly ? (["allocation_drift"] as DetectorKey[]) : []),
  ];
  for (const key of systemKeys) {
    const def = detectorRegistry[key];
    try {
      findings.push(...def.run(input, def.defaultParams));
    } catch (err) {
      failures.push(key);
      ctx.logger.error(`detector ${key} failed`, { err: String(err) });
    }
  }

  // Insert anomalies idempotently — unique (workspace, type, evidence_hash).
  let inserted = 0;
  let notified = 0;
  for (const f of findings) {
    const rows = await db.execute(rawSql`
      insert into anomalies
        (workspace_id, type, severity, status, title, explanation, evidence_tx_ids, evidence_hash)
      values
        (${ctx.workspaceId}, ${f.detectorKey}, ${f.severity}, 'open', ${f.title},
         ${detectorRegistry[f.detectorKey].explainTemplate(f)},
         ${`{${f.evidenceTxIds.join(",")}}`}::uuid[], ${f.evidenceHash})
      on conflict (workspace_id, type, evidence_hash) do nothing
      returning id
    `);
    const insertedRows = rows as unknown as Array<{ id: string }>;
    inserted += insertedRows.length;
    // §14.4: high-severity anomalies also notify (dedup 'anomaly:' + id).
    const first = insertedRows[0];
    if (first && f.severity === "high") {
      const note = await db.execute(rawSql`
        insert into notifications (workspace_id, title, body, dedup_key, evidence)
        values (${ctx.workspaceId}, ${f.title},
                ${detectorRegistry[f.detectorKey].explainTemplate(f)},
                ${`anomaly:${first.id}`},
                ${JSON.stringify({ ids: f.evidenceTxIds })})
        on conflict (workspace_id, dedup_key) do nothing
        returning id
      `);
      notified += (note as unknown as Array<{ id: string }>).length;
    }
  }

  // User alert rules — same engine, user params (§14.2); notifications dedup
  // on alertRuleId + evidenceHash (§14.4).
  const rules = await db.execute(rawSql`
    select id, type, name, params from alert_rules
    where workspace_id = ${ctx.workspaceId} and enabled
  `);
  for (const rule of rules as unknown as Array<{ id: string; type: DetectorKey; name: string; params: unknown }>) {
    const def = detectorRegistry[rule.type];
    if (!def) continue;
    try {
      const params = def.paramsSchema.parse(rule.params);
      const ruleFindings = def.run(input, params);
      for (const f of ruleFindings) {
        const note = await db.execute(rawSql`
          insert into notifications (workspace_id, alert_rule_id, title, body, dedup_key, evidence)
          values (${ctx.workspaceId}, ${rule.id}, ${`${rule.name}: ${f.title}`},
                  ${def.explainTemplate(f)}, ${`${rule.id}:${f.evidenceHash}`},
                  ${JSON.stringify({ ids: f.evidenceTxIds })})
          on conflict (workspace_id, dedup_key) do nothing
          returning id
        `);
        const newRows = (note as unknown as Array<{ id: string }>).length;
        notified += newRows;
        if (newRows > 0) {
          await db.execute(rawSql`
            update alert_rules
            set last_triggered_at = now(), trigger_count = trigger_count + ${newRows}
            where id = ${rule.id}
          `);
        }
      }
    } catch (err) {
      failures.push(`rule:${rule.id}`);
      ctx.logger.error(`alert rule ${rule.id} failed`, { err: String(err) });
    }
  }

  return { findings: findings.length, inserted, notified, failures };
}

export async function runNightly(today: MarketDate) {
  // Advisory lock so a cron overlapping a deploy exits cleanly (§23.10-3).
  const db = adminDb();
  const lockRows = await db.execute(
    rawSql`select pg_try_advisory_lock(hashtext('nightly')) as acquired`,
  );
  const acquired = (lockRows as unknown as Array<{ acquired: boolean }>)[0]?.acquired;
  if (!acquired) {
    return { skipped: true, reason: "another nightly run holds the lock" };
  }
  try {
    const workspacesRows = await db.execute(rawSql`
      select id, clerk_user_id from workspaces
    `);
    const summary = { workspaces: 0, snapshots: 0, anomalies: 0, notifications: 0, failures: [] as string[] };
    for (const ws of workspacesRows as unknown as Array<{ id: string; clerk_user_id: string }>) {
      try {
        await withRls(ws.clerk_user_id, async (rlsDb) => {
          const recompute = await recomputeSnapshots(rlsDb, ws.id as WorkspaceId, { today });
          summary.snapshots += recompute.written;
        });
        await withRls(ws.clerk_user_id, async (rlsDb) => {
          const ctx = buildCtx({ userId: ws.clerk_user_id, workspaceId: ws.id as WorkspaceId, db: rlsDb });
          const result = await runDetectorsForWorkspace(ctx, rlsDb, today, { includeNightlyOnly: true });
          summary.anomalies += result.inserted;
          summary.notifications += result.notified;
          summary.failures.push(...result.failures);
        });
        summary.workspaces += 1;
      } catch (err) {
        summary.failures.push(`workspace:${ws.id}:${String(err)}`);
      }
    }
    return summary;
  } finally {
    await db.execute(rawSql`select pg_advisory_unlock(hashtext('nightly'))`);
  }
}
