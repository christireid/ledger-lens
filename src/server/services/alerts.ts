import "server-only";

import { and, desc, eq } from "drizzle-orm";
import type { z } from "zod";

import type { AlertRuleInputSchema, AlertRulePatchSchema } from "@/lib/schemas/api";
import type { MarketDate } from "@/lib/schemas";
import type { Ctx } from "@/server/context";
import { alertRules } from "@/server/db/schema";
import type { RlsDb } from "@/server/db/rls";
import { detectorRegistry } from "@/server/engine/detect/registry";
import type { DetectorInput } from "@/server/engine/detect/types";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors";
import { isUniqueViolation } from "@/server/services/accounts";
import { loadDetectorInput } from "@/server/services/detection";

export async function listAlertRules(ctx: Ctx, db: RlsDb) {
  if (!ctx.can("alerts:manage")) throw new ForbiddenError();
  return db
    .select()
    .from(alertRules)
    .where(eq(alertRules.workspaceId, ctx.workspaceId))
    .orderBy(desc(alertRules.createdAt));
}

export async function createAlertRule(
  ctx: Ctx,
  db: RlsDb,
  input: z.infer<typeof AlertRuleInputSchema>,
) {
  if (!ctx.can("alerts:manage")) throw new ForbiddenError();
  try {
    const [row] = await db
      .insert(alertRules)
      .values({
        workspaceId: ctx.workspaceId,
        type: input.type,
        name: input.name,
        params: input.params,
        enabled: input.enabled,
      })
      .returning();
    return row!;
  } catch (err) {
    if (isUniqueViolation(err)) {
      // §17.2: 409 duplicate_rule with the existing rule id (S-08)
      const [existing] = await db
        .select({ id: alertRules.id })
        .from(alertRules)
        .where(and(eq(alertRules.workspaceId, ctx.workspaceId), eq(alertRules.type, input.type)))
        .limit(1);
      throw new ConflictError("duplicate_rule", "An identical rule already exists.", {
        existingId: existing?.id,
      });
    }
    throw err;
  }
}

export async function patchAlertRule(
  ctx: Ctx,
  db: RlsDb,
  id: string,
  patch: z.infer<typeof AlertRulePatchSchema>,
) {
  if (!ctx.can("alerts:manage")) throw new ForbiddenError();
  const [existing] = await db
    .select()
    .from(alertRules)
    .where(and(eq(alertRules.id, id), eq(alertRules.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!existing) throw new NotFoundError();
  // params re-validated against the rule's type schema (§14.2 one source of truth)
  let params = existing.params;
  if (patch.params) {
    params = detectorRegistry[existing.type].paramsSchema.parse(patch.params);
  }
  const [row] = await db
    .update(alertRules)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      params,
    })
    .where(eq(alertRules.id, id))
    .returning();
  return row!;
}

export async function deleteAlertRule(ctx: Ctx, db: RlsDb, id: string) {
  if (!ctx.can("alerts:manage")) throw new ForbiddenError();
  const rows = await db
    .delete(alertRules)
    .where(and(eq(alertRules.id, id), eq(alertRules.workspaceId, ctx.workspaceId)))
    .returning({ id: alertRules.id });
  if (rows.length === 0) throw new NotFoundError();
}

/**
 * POST /alerts/preview — §14.2 shared-path guarantee: the identical detector
 * run over the trailing 90 days ("would have triggered n times").
 */
export async function previewAlertRule(
  ctx: Ctx,
  db: RlsDb,
  input: z.infer<typeof AlertRuleInputSchema>,
  asOf?: MarketDate,
): Promise<{ wouldTrigger: number; window: "90d" }> {
  if (!ctx.can("alerts:manage")) throw new ForbiddenError();
  const def = detectorRegistry[input.type];
  const params = def.paramsSchema.parse(input.params);
  const evaluationDate = asOf ?? (new Date().toISOString().slice(0, 10) as MarketDate);
  const detectorInput: DetectorInput = await loadDetectorInput(ctx, db, evaluationDate);
  const cutoff = new Date(Date.parse(evaluationDate) - 90 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const windowed: DetectorInput = {
    ...detectorInput,
    transactions: detectorInput.transactions.filter((t) => t.date >= cutoff),
  };
  const findings = def.run(windowed, params);
  return { wouldTrigger: findings.length, window: "90d" };
}
