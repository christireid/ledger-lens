import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  accountType,
  alertType,
  anomalySeverity,
  anomalyStatus,
  batchStatus,
  instrumentKind,
  messageRole,
  transactionType,
} from "@/server/db/schema/enums";

/**
 * Table inventory — §09.3 (normative). Conventions per §09.2: uuid PKs via
 * gen_random_uuid(); timestamptz everywhere except transaction dates (date —
 * market-date semantics §02.8-5); money numeric(18,4), quantities
 * numeric(20,8), currency char(3); workspace_id denormalized on every row.
 * Expression indexes (lower(name), md5(params), tsvector) and RLS live in the
 * custom SQL migration — drizzle owns plain-column DDL.
 */

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  name: text("name").notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
  baseCurrency: char("base_currency", { length: 3 }).notNull().default("USD"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: accountType("type").notNull(),
    institution: text("institution"),
    currency: char("currency", { length: 3 }).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // §09.3: unique (workspace_id, lower(name)) — expression unique index
    uniqueIndex("accounts_workspace_lower_name_uq").on(
      t.workspaceId,
      sql`lower(${t.name})`,
    ),
    // §09.3: queries exclude archived by default via partial-index-backed predicate
    index("accounts_workspace_active_idx")
      .on(t.workspaceId)
      .where(sql`${t.archivedAt} is null`),
  ],
);

export const instruments = pgTable(
  "instruments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    symbol: text("symbol").notNull(),
    name: text("name"),
    kind: instrumentKind("kind").notNull().default("equity"),
    currency: char("currency", { length: 3 }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("instruments_symbol_kind_uq").on(t.symbol, t.kind)],
);

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    fileName: text("file_name"),
    contentHash: text("content_hash").notNull(), // SHA-256
    status: batchStatus("status").notNull().default("draft"),
    mapping: jsonb("mapping"), // column-map profile, Zod-validated shape from §15
    // Raw upload persisted for the wizard's validate/commit steps (§17.2 takes
    // no file body after upload) — base64, ≤10 MB cap. DECISIONS.md 2026-07-30.
    rawContent: text("raw_content"),
    stats: jsonb("stats"), // accepted/rejected/dup counts
    idempotencyKey: uuid("idempotency_key").unique(), // §07.11-2
    rejectedRows: jsonb("rejected_rows"), // ≤10k rows; beyond cap → storage object ref (§15)
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // §09.9-1: drafts of the same file may coexist; commit collides
    uniqueIndex("import_batches_workspace_hash_committed_uq")
      .on(t.workspaceId, t.contentHash)
      .where(sql`${t.status} = 'committed'`),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    importBatchId: uuid("import_batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    sourceLine: integer("source_line"), // lineage to the file row
    date: date("date").notNull(), // market-date semantics, §02.8-5
    type: transactionType("type").notNull(),
    amount: numeric("amount", { precision: 18, scale: 4 }).notNull(), // signed, account-currency
    currency: char("currency", { length: 3 }).notNull(),
    instrumentId: uuid("instrument_id").references(() => instruments.id),
    quantity: numeric("quantity", { precision: 20, scale: 8 }),
    price: numeric("price", { precision: 18, scale: 4 }),
    description: text("description").notNull().default(""),
    supersedesId: uuid("supersedes_id"), // self-ref, §02.4-3 (FK added in custom SQL)
    superseded: boolean("superseded").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "transactions_trade_fields_all_or_none",
      sql`${t.type} not in ('buy','sell') or (${t.instrumentId} is not null and ${t.quantity} is not null and ${t.price} is not null)`,
    ),
    check(
      "transactions_quantity_nonzero",
      sql`${t.quantity} is null or ${t.quantity} <> 0`,
    ),
    check(
      "transactions_amount_nonzero",
      sql`${t.amount} <> 0 or ${t.type} = 'other'`,
    ),
    check(
      "transactions_no_self_supersede",
      sql`${t.supersedesId} <> ${t.id}`,
    ),
    // §09.5 index strategy — every index cites its consumer
    index("transactions_workspace_date_id_idx").on(
      t.workspaceId,
      t.date.desc(),
      t.id.desc(),
    ), // ledger default sort + cursor pagination (05.5)
    index("transactions_workspace_account_date_idx")
      .on(t.workspaceId, t.accountId, t.date)
      .where(sql`not ${t.superseded}`), // account filter, running balance
    index("transactions_workspace_instrument_date_idx")
      .on(t.workspaceId, t.instrumentId, t.date)
      .where(sql`not ${t.superseded}`), // Portfolio Engine replay (12)
    index("transactions_workspace_type_date_idx").on(
      t.workspaceId,
      t.type,
      t.date,
    ), // type filters, fee analytics (13)
    index("transactions_import_batch_idx").on(t.importBatchId), // batch lineage (S-11)
  ],
);

export const portfolioSnapshots = pgTable(
  "portfolio_snapshots",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    asOf: date("as_of").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }),
    totalValue: numeric("total_value", { precision: 18, scale: 4 }),
    cashValue: numeric("cash_value", { precision: 18, scale: 4 }),
    // §13.3 (normative amendment to §09.3): cumulative realized P&L scalar so
    // period values are subtraction, not re-replay.
    realizedPnlCum: numeric("realized_pnl_cum", { precision: 18, scale: 4 }),
    schemaVersion: integer("schema_version").notNull().default(1),
    positions: jsonb("positions").notNull(), // read-whole-or-not-at-all (§09.3 rationale)
    perAccount: jsonb("per_account"),
    perCurrency: jsonb("per_currency"),
    inputMaxTxCreatedAt: timestamp("input_max_tx_created_at", {
      withTimezone: true,
    }), // reproducibility watermark; null = computed from empty ledger
    // §16.3 Snapshot.flags persistence ('partial_backfill' | 'stale') —
    // additive column, DECISIONS.md 2026-07-30.
    flags: text("flags").array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("portfolio_snapshots_workspace_as_of_uq").on(
      t.workspaceId,
      t.asOf,
    ), // upsert key (07.6)
    index("portfolio_snapshots_workspace_as_of_desc_idx").on(
      t.workspaceId,
      t.asOf.desc(),
    ), // series + latest (13)
  ],
);

export const anomalies = pgTable(
  "anomalies",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // detector key, §14 registry
    severity: anomalySeverity("severity").notNull(),
    status: anomalyStatus("status").notNull().default("open"),
    title: text("title").notNull(),
    explanation: text("explanation"), // AI-generated copy, §08.2
    evidenceTxIds: uuid("evidence_tx_ids").array().notNull(),
    evidenceHash: text("evidence_hash").notNull(), // stable hash of sorted evidence
    detectedBatchId: uuid("detected_batch_id").references(
      () => importBatches.id,
    ),
    statusChangedBy: text("status_changed_by"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("anomalies_workspace_type_evidence_uq").on(
      t.workspaceId,
      t.type,
      t.evidenceHash,
    ), // detector idempotency (07.6)
    index("anomalies_workspace_status_severity_idx").on(
      t.workspaceId,
      t.status,
      t.severity.desc(),
    ), // triage queue (05.6)
  ],
);

export const alertRules = pgTable("alert_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  type: alertType("type").notNull(),
  name: text("name").notNull(),
  params: jsonb("params").notNull(), // per-type Zod schema, §14
  enabled: boolean("enabled").notNull().default(true),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  triggerCount: integer("trigger_count").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  // duplicate-rule block (S-08): unique (workspace_id, type, md5(params::text))
  // — expression index in the custom SQL migration
});

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    alertRuleId: uuid("alert_rule_id").references(() => alertRules.id, {
      onDelete: "set null",
    }), // null = system notification
    title: text("title").notNull(),
    body: text("body").notNull(),
    evidence: jsonb("evidence"), // drawer descriptor per §03.6.4 contract
    dedupKey: text("dedup_key").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("notifications_workspace_dedup_uq").on(
      t.workspaceId,
      t.dedupKey,
    ), // US-07 suppression
    index("notifications_workspace_unread_idx")
      .on(t.workspaceId)
      .where(sql`${t.readAt} is null`), // unread count (03.3.3)
  ],
);

export const investigations = pgTable("investigations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  summary: text("summary"), // rolling, §08.4-4
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    // workspace_id denormalized per §09.2 convention (RLS on every row)
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    investigationId: uuid("investigation_id")
      .notNull()
      .references(() => investigations.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    content: text("content").notNull(),
    stopped: boolean("stopped").notNull().default(false),
    promptVersion: text("prompt_version"),
    model: text("model"),
    usage: jsonb("usage"),
    createdAt: createdAt(),
  },
  (t) => [
    // §09.3: the §08.12 required fields are not null for role='assistant'
    check(
      "messages_assistant_fields_required",
      sql`${t.role} <> 'assistant' or (${t.promptVersion} is not null and ${t.model} is not null and ${t.usage} is not null)`,
    ),
    index("messages_investigation_created_idx").on(
      t.investigationId,
      t.createdAt,
    ), // thread load
  ],
);

export const messageCitations = pgTable("message_citations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  // workspace_id denormalized per §09.2 convention
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  ord: integer("ord").notNull(),
  kind: text("kind").notNull(),
  refIds: uuid("ref_ids").array().notNull(),
  label: text("label"),
});

export const aiEvalLog = pgTable("ai_eval_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  messageId: uuid("message_id").references(() => messages.id, {
    onDelete: "set null",
  }),
  promptVersion: text("prompt_version"),
  model: text("model"),
  toolCalls: jsonb("tool_calls"),
  latencyMs: integer("latency_ms"),
  usage: jsonb("usage"),
  feedback: smallint("feedback"), // +1/-1
  createdAt: createdAt(),
});
