import { TransactionsQuerySchema } from "@/lib/schemas/api";
import { fromPublicId } from "@/lib/public-ids";
import { ok, withApi } from "@/server/api/with-api";
import { listTransactions, resolveAccountUuids } from "@/server/services/transactions";
import { txToWire } from "@/server/api/wire";

export const GET = withApi(
  { querySchema: TransactionsQuerySchema },
  async ({ ctx, db, query }) => {
    const accountUuids = query.accountIds
      ? await resolveAccountUuids(
          ctx,
          db,
          query.accountIds
            .split(",")
            .map((p) => fromPublicId("account", p))
            .filter((u): u is string => u !== null),
        )
      : undefined;
    const batchUuid = query.batchId ? fromPublicId("batch", query.batchId) : null;
    const { rows, cursor, total } = await listTransactions(ctx, db, {
      ...query,
      ...(accountUuids ? { accountUuids } : {}),
      ...(batchUuid ? { batchUuid } : {}),
    });
    return ok(
      rows.map((r) => txToWire(r.tx, r.symbol)),
      { cursor, total },
    );
  },
);

