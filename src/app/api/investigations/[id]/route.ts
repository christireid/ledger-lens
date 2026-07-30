import { InvestigationPatchSchema } from "@/lib/schemas/api";
import { fromPublicId } from "@/lib/public-ids";
import { noContent, ok, withApi } from "@/server/api/with-api";
import { investigationToWire, messageToWire } from "@/server/api/wire";
import { NotFoundError } from "@/server/errors";
import {
  deleteInvestigation,
  getInvestigation,
  patchInvestigation,
} from "@/server/services/investigations";

export const GET = withApi({}, async ({ ctx, db, params }) => {
  const uuid = fromPublicId("investigation", params.id ?? "");
  if (!uuid) throw new NotFoundError();
  const { investigation, messages, citations } = await getInvestigation(ctx, db, uuid);
  return ok({
    ...investigationToWire(investigation),
    messages: messages.map((m) =>
      messageToWire(m, citations.filter((c) => c.messageId === m.id)),
    ),
  });
});

export const PATCH = withApi(
  { bodySchema: InvestigationPatchSchema },
  async ({ ctx, db, body, params }) => {
    const uuid = fromPublicId("investigation", params.id ?? "");
    if (!uuid) throw new NotFoundError();
    const row = await patchInvestigation(ctx, db, uuid, body.title);
    return ok(investigationToWire(row));
  },
);

export const DELETE = withApi({}, async ({ ctx, db, params }) => {
  const uuid = fromPublicId("investigation", params.id ?? "");
  if (!uuid) throw new NotFoundError();
  await deleteInvestigation(ctx, db, uuid);
  return noContent();
});
