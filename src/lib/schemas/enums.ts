import { z } from "zod";

/**
 * Enums — single source, spec §16.3. Mirrored by §09.2's Postgres enums;
 * a unit test asserts the string sets match the DB schema definitions.
 * Enum evolution policy: additive only (§09.2).
 */

export const TRANSACTION_TYPES = [
  "buy",
  "sell",
  "dividend",
  "interest",
  "deposit",
  "withdrawal",
  "fee",
  "transfer_in",
  "transfer_out",
  "other",
] as const;
export const TransactionTypeSchema = z.enum(TRANSACTION_TYPES);
export type TransactionType = z.infer<typeof TransactionTypeSchema>;

export const ACCOUNT_TYPES = ["brokerage", "bank", "card", "other"] as const;
export const AccountTypeSchema = z.enum(ACCOUNT_TYPES);
export type AccountType = z.infer<typeof AccountTypeSchema>;

export const INSTRUMENT_KINDS = ["equity", "etf", "cash"] as const;
export const InstrumentKindSchema = z.enum(INSTRUMENT_KINDS);
export type InstrumentKind = z.infer<typeof InstrumentKindSchema>;

export const ANOMALY_SEVERITIES = ["low", "medium", "high"] as const;
export const AnomalySeveritySchema = z.enum(ANOMALY_SEVERITIES);
export type AnomalySeverity = z.infer<typeof AnomalySeveritySchema>;

export const ANOMALY_STATUSES = ["open", "acknowledged", "dismissed"] as const;
export const AnomalyStatusSchema = z.enum(ANOMALY_STATUSES);
export type AnomalyStatus = z.infer<typeof AnomalyStatusSchema>;

/** D5 excluded per §14.3. */
export const ALERT_TYPES = [
  "large_transaction",
  "fee_spike",
  "allocation_drift",
  "account_inactivity",
] as const;
export const AlertTypeSchema = z.enum(ALERT_TYPES);
export type AlertType = z.infer<typeof AlertTypeSchema>;

export const BATCH_STATUSES = [
  "draft",
  "mapped",
  "validated",
  "committed",
  "failed",
] as const;
export const BatchStatusSchema = z.enum(BATCH_STATUSES);
export type BatchStatus = z.infer<typeof BatchStatusSchema>;

export const MESSAGE_ROLES = ["user", "assistant"] as const;
export const MessageRoleSchema = z.enum(MESSAGE_ROLES);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

/** Closed enum from §15.4/§15.6 — app-level (reject rows), not a PG enum. */
export const REJECT_CODES = [
  "date_unparseable",
  "date_out_of_range",
  "amount_unparseable",
  "amount_zero",
  "sign_conflict",
  "incomplete_trade",
  "currency_unknown",
] as const;
export const RejectCodeSchema = z.enum(REJECT_CODES);
export type RejectCode = z.infer<typeof RejectCodeSchema>;

export const POSITION_FLAGS = [
  "incomplete_history",
  "unpriced",
  "zero_price_lot",
] as const;
export const PositionFlagSchema = z.enum(POSITION_FLAGS);
export type PositionFlag = z.infer<typeof PositionFlagSchema>;

export const SNAPSHOT_FLAGS = ["partial_backfill", "stale"] as const;
export const SnapshotFlagSchema = z.enum(SNAPSHOT_FLAGS);
export type SnapshotFlag = z.infer<typeof SnapshotFlagSchema>;
