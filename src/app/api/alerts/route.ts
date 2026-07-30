import { AlertRuleInputSchema } from "@/lib/schemas/api";
import { created, ok, withApi } from "@/server/api/with-api";
import { alertRuleToWire } from "@/server/api/wire";
import { createAlertRule, listAlertRules } from "@/server/services/alerts";

export const GET = withApi({}, async ({ ctx, db }) => {
  const rows = await listAlertRules(ctx, db);
  return ok(rows.map(alertRuleToWire));
});

export const POST = withApi(
  { bodySchema: AlertRuleInputSchema },
  async ({ ctx, db, body }) => {
    const row = await createAlertRule(ctx, db, body);
    return created(alertRuleToWire(row));
  },
);
