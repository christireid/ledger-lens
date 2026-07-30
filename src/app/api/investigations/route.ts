import { created, ok, withApi } from "@/server/api/with-api";
import { investigationToWire } from "@/server/api/wire";
import { createInvestigation, listInvestigations } from "@/server/services/investigations";

export const GET = withApi({}, async ({ ctx, db }) => {
  const rows = await listInvestigations(ctx, db);
  return ok(rows.map(investigationToWire));
});

export const POST = withApi({}, async ({ ctx, db }) => {
  const row = await createInvestigation(ctx, db);
  return created(investigationToWire(row));
});
