import { AlertRuleInputSchema } from "@/lib/schemas/api";
import { ok, withApi } from "@/server/api/with-api";
import { previewAlertRule } from "@/server/services/alerts";

export const POST = withApi(
  { bodySchema: AlertRuleInputSchema },
  async ({ ctx, db, body }) => {
    const preview = await previewAlertRule(ctx, db, body);
    return ok(preview);
  },
);
