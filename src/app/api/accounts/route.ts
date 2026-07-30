import { AccountInputSchema, AccountsQuerySchema } from "@/lib/schemas/api";
import { created, ok, withApi } from "@/server/api/with-api";
import { accountToWire } from "@/server/api/wire";
import { createAccount, listAccounts } from "@/server/services/accounts";

export const GET = withApi(
  { querySchema: AccountsQuerySchema },
  async ({ ctx, db, query }) => {
    const rows = await listAccounts(ctx, db, query.includeArchived ?? false);
    return ok(rows.map(accountToWire));
  },
);

export const POST = withApi(
  { bodySchema: AccountInputSchema },
  async ({ ctx, db, body }) => {
    const row = await createAccount(ctx, db, body);
    return created(accountToWire(row));
  },
);
