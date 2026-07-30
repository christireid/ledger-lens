import { FeedbackBodySchema } from "@/lib/schemas/api";
import { fromPublicId } from "@/lib/public-ids";
import { noContent, withApi } from "@/server/api/with-api";
import { NotFoundError } from "@/server/errors";
import { recordFeedback } from "@/server/services/investigations";

export const POST = withApi(
  { bodySchema: FeedbackBodySchema },
  async ({ ctx, db, body, params }) => {
    const uuid = fromPublicId("message", params.id ?? "");
    if (!uuid) throw new NotFoundError();
    await recordFeedback(ctx, db, uuid, body.value);
    return noContent();
  },
);
