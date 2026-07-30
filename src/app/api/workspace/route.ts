import { WorkspacePatchSchema } from "@/lib/schemas/api";
import { noContent, ok, withApi } from "@/server/api/with-api";
import { workspaceToWire } from "@/server/api/wire";
import { deleteWorkspace, getWorkspace, patchWorkspace } from "@/server/services/workspace-admin";

export const GET = withApi({}, async ({ ctx, db }) => {
  return ok(workspaceToWire(await getWorkspace(ctx, db)));
});

export const PATCH = withApi(
  { bodySchema: WorkspacePatchSchema },
  async ({ ctx, db, body }) => {
    return ok(workspaceToWire(await patchWorkspace(ctx, db, body)));
  },
);

export const DELETE = withApi({}, async ({ ctx, db }) => {
  await deleteWorkspace(ctx, db);
  return noContent();
});
