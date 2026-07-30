import { NotificationsReadSchema } from "@/lib/schemas/api";
import { fromPublicId } from "@/lib/public-ids";
import { ok, withApi } from "@/server/api/with-api";
import { markRead } from "@/server/services/notifications";

export const POST = withApi(
  { bodySchema: NotificationsReadSchema },
  async ({ ctx, db, body }) => {
    const input =
      "all" in body
        ? body
        : {
            ids: body.ids
              .map((p) => fromPublicId("notification", p))
              .filter((u): u is string => u !== null),
          };
    const count = await markRead(ctx, db, input);
    return ok({ count });
  },
);
