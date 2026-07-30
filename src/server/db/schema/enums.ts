import { pgEnum } from "drizzle-orm/pg-core";

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

/**
 * Postgres enums — §09.2. Values sourced from the canonical §16 enum module
 * so TS and PG cannot drift (enum-parity unit test enforces set equality).
 * Evolution policy: additive only.
 */
export const accountType = pgEnum("account_type", ACCOUNT_TYPES);
export const transactionType = pgEnum("transaction_type", TRANSACTION_TYPES);
export const instrumentKind = pgEnum("instrument_kind", INSTRUMENT_KINDS);
export const anomalyStatus = pgEnum("anomaly_status", ANOMALY_STATUSES);
export const anomalySeverity = pgEnum("anomaly_severity", ANOMALY_SEVERITIES);
export const alertType = pgEnum("alert_type", ALERT_TYPES);
export const batchStatus = pgEnum("batch_status", BATCH_STATUSES);
export const messageRole = pgEnum("message_role", MESSAGE_ROLES);
