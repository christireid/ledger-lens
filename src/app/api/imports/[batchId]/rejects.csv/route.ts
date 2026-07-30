import { fromPublicId } from "@/lib/public-ids";
import { withApi } from "@/server/api/with-api";
import { NotFoundError } from "@/server/errors";
import { getBatch } from "@/server/services/import-queries";
import { parseFile } from "@/server/import/parse";
import { rejectsCsv, type RejectedRow } from "@/server/services/import-csv";

export const GET = withApi({}, async ({ ctx, db, params }) => {
  const uuid = fromPublicId("batch", params.batchId ?? "");
  if (!uuid) throw new NotFoundError();
  const batch = await getBatch(ctx, db, uuid);
  const rejected = (batch.rejectedRows ?? []) as RejectedRow[];
  let headers: string[] = [];
  if (batch.rawContent) {
    try {
      headers = parseFile(new Uint8Array(Buffer.from(batch.rawContent, "base64"))).headers;
    } catch {
      headers = [];
    }
  }
  const csv = rejectsCsv(headers, rejected);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rejects-${params.batchId}.csv"`,
    },
  });
});
