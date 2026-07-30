import { AlertRulePatchSchema } from "@/lib/schemas/api";
import { fromPublicId } from "@/lib/public-ids";
import { noContent, ok, withApi } from "@/server/api/with-api";
import { alertRuleToWire } from "@/server/api/wire";
import { NotFoundError } from "@/server/errors";
import { deleteAlertRule, patchAlertRule } from "@/server/services/alerts";

export const PATCH = withApi(
  { bodySchema: AlertRulePatchSchema },
  async ({ ctx, db, body, params }) => {
    const uuid = fromPublicId("alertRule", params.id ?? "");
    if (!uuid) throw new NotFoundError();
    const row = await patchAlertRule(ctx, db, uuid, body);
    return ok(alertRuleToWire(row));
  },
);

export const DELETE = withApi({}, async ({ ctx, db, params }) => {
  const uuid = fromPublicId("alertRule", params.id ?? "");
  if (!uuid) throw new NotFoundError();
  await deleteAlertRule(ctx, db, uuid);
  return noContent();
});
