import { DemoActionSchema } from "@/lib/schemas/api";
import { ok, withApi } from "@/server/api/with-api";
import { demoAction } from "@/server/services/workspace-admin";

export const maxDuration = 60;

export const POST = withApi(
  { bodySchema: DemoActionSchema },
  async ({ ctx, db, body }) => {
    const result = await demoAction(ctx, db, body.action);
    return ok({ status: "accepted", ...result }, undefined, 202);
  },
);
