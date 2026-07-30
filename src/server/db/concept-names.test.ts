import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import * as schema from "@/server/db/schema/tables";

/**
 * §09.10 / §02.13 gate: all §02.4 domain concepts present with identical
 * names — checklist test enumerating table names.
 */
describe("concept-name checklist (§02.4 ↔ §09.3)", () => {
  it("every §02.4 concept has its table, named identically", () => {
    const tables = Object.values(schema).map((t) => getTableName(t));
    expect(new Set(tables)).toEqual(
      new Set([
        "workspaces",
        "accounts",
        "instruments",
        "transactions",
        "import_batches",
        "portfolio_snapshots",
        "anomalies",
        "alert_rules",
        "notifications",
        "investigations",
        "messages",
        "message_citations",
        "ai_eval_log",
      ]),
    );
  });
});
