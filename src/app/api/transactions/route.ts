import { TransactionsQuerySchema } from "@/lib/schemas/api";
import { fromPublicId } from "@/lib/public-ids";
import { ok, withApi } from "@/server/api/with-api";
import { countTransactions, listTransactions, resolveAccountUuids } from "@/server/services/transactions";
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
    const args = {
      ...query,
      ...(accountUuids ? { accountUuids } : {}),
      ...(batchUuid ? { batchUuid } : {}),
    };
    // §20.2: the count is its own request (countOnly=1) so the filter
    // round-trip serves rows without paying for the capped count.
    if (query.countOnly === "1") {
      const total = await countTransactions(ctx, db, args);
      return ok([], { cursor: null, total });
    }
    const { rows, cursor } = await listTransactions(ctx, db, args);
    return ok(
      rows.map((r) => txToWire(r.tx, r.symbol)),
      { cursor },
    );
  },
);

