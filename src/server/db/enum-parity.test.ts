import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACCOUNT_TYPES,
  ALERT_TYPES,
  ANOMALY_SEVERITIES,
  ANOMALY_STATUSES,
  BATCH_STATUSES,
  INSTRUMENT_KINDS,
  MESSAGE_ROLES,
  TRANSACTION_TYPES,
} from "@/lib/schemas/enums";
import * as pgEnums from "@/server/db/schema/enums";

/**
 * Enum parity — §16.5 invariant row "enum parity": the §16 TS enum string sets
 * must equal both (a) the drizzle pgEnum definitions and (b) the committed
 * migration SQL's CREATE TYPE statements (what the DB actually gets).
 */

const EXPECTED: Record<string, readonly string[]> = {
  account_type: ACCOUNT_TYPES,
  transaction_type: TRANSACTION_TYPES,
  instrument_kind: INSTRUMENT_KINDS,
  anomaly_status: ANOMALY_STATUSES,
  anomaly_severity: ANOMALY_SEVERITIES,
  alert_type: ALERT_TYPES,
  batch_status: BATCH_STATUSES,
  message_role: MESSAGE_ROLES,
};

function parseSqlEnums(): Record<string, string[]> {
  const dir = path.resolve(__dirname, "../../../supabase/migrations");
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(path.join(dir, f), "utf8"))
    .join("\n");
  const result: Record<string, string[]> = {};
  const re =
    /CREATE TYPE "?(?:public"?\."?)?(\w+)"? AS ENUM\s*\(([^)]*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1];
    const values = (m[2] ?? "")
      .split(",")
      .map((v) => v.trim().replace(/^'|'$/g, ""));
    if (name) result[name] = values;
  }
  return result;
}

describe("enum parity (§09.2 ↔ §16.3)", () => {
  const sqlEnums = parseSqlEnums();

  it("every §16 enum exists in the migration SQL with an identical value set", () => {
    for (const [pgName, tsValues] of Object.entries(EXPECTED)) {
      expect(sqlEnums[pgName], `PG enum ${pgName} missing from migrations`).toBeDefined();
      expect(new Set(sqlEnums[pgName])).toEqual(new Set(tsValues));
      // additive-only policy makes order part of the contract too (§09.2)
      expect(sqlEnums[pgName]).toEqual([...tsValues]);
    }
  });

  it("no unexpected PG enums exist", () => {
    expect(Object.keys(sqlEnums).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it("drizzle pgEnum definitions source from the §16 constants", () => {
    expect(pgEnums.accountType.enumValues).toEqual([...ACCOUNT_TYPES]);
    expect(pgEnums.transactionType.enumValues).toEqual([...TRANSACTION_TYPES]);
    expect(pgEnums.instrumentKind.enumValues).toEqual([...INSTRUMENT_KINDS]);
    expect(pgEnums.anomalyStatus.enumValues).toEqual([...ANOMALY_STATUSES]);
    expect(pgEnums.anomalySeverity.enumValues).toEqual([...ANOMALY_SEVERITIES]);
    expect(pgEnums.alertType.enumValues).toEqual([...ALERT_TYPES]);
    expect(pgEnums.batchStatus.enumValues).toEqual([...BATCH_STATUSES]);
    expect(pgEnums.messageRole.enumValues).toEqual([...MESSAGE_ROLES]);
  });
});
