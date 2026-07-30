import { MessageBodySchema } from "@/lib/schemas/api";
import { fromPublicId } from "@/lib/public-ids";
import { withApi } from "@/server/api/with-api";
import { NotFoundError } from "@/server/errors";
import { streamInvestigationMessage } from "@/server/services/ai";

// §17.3 SSE stream — maxDuration elevated (§07.11); full loop lands in M8.
export const maxDuration = 120;

export const POST = withApi(
  { bodySchema: MessageBodySchema, rateScope: "ai" },
  async ({ ctx, db, body, params }) => {
    const uuid = fromPublicId("investigation", params.id ?? "");
    if (!uuid) throw new NotFoundError();
    return streamInvestigationMessage(ctx, db, uuid, body.content);
  },
);
