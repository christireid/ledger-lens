import { CursorQuerySchema } from "@/lib/schemas/api";
import { ok, withApi } from "@/server/api/with-api";
import { notificationToWire } from "@/server/api/wire";
import { listNotifications } from "@/server/services/notifications";

export const GET = withApi(
  { querySchema: CursorQuerySchema },
  async ({ ctx, db, query }) => {
    const { rows, unreadCount } = await listNotifications(ctx, db, query.limit);
    // unread count piggybacks meta (§17.2)
    return ok(rows.map(notificationToWire), { total: unreadCount });
  },
);
