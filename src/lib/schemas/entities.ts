import { z } from "zod";

import {
  AccountTypeSchema,
  AlertTypeSchema,
  AnomalySeveritySchema,
  AnomalyStatusSchema,
  BatchStatusSchema,
  InstrumentKindSchema,
  MessageRoleSchema,
  PositionFlagSchema,
  SnapshotFlagSchema,
  TransactionTypeSchema,
} from "@/lib/schemas/enums";
import {
  AccountIdSchema,
  AlertRuleIdSchema,
  AnomalyIdSchema,
  BatchIdSchema,
  CurrencyCodeSchema,
  InstrumentIdSchema,
  InvestigationIdSchema,
  IsoTimestampSchema,
  MarketDateSchema,
  MessageIdSchema,
  MoneySchema,
  NotificationIdSchema,
  QtySchema,
  TransactionIdSchema,
  WorkspaceIdSchema,
} from "@/lib/schemas/primitives";

/**
 * Entity types — canonical shapes per spec §16.3. One definition serves URL
 * state (06.6), forms (06.7), API validation (07.5), and DB constraints (09).
 * Invariant table: §16.5.
 */

export const WorkspaceSchema = z.object({
  id: WorkspaceIdSchema,
  clerkUserId: z.string().min(1),
  name: z.string().min(1),
  isDemo: z.boolean(),
  baseCurrency: CurrencyCodeSchema,
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const AccountSchema = z.object({
  id: AccountIdSchema,
  workspaceId: WorkspaceIdSchema,
  name: z.string().min(1),
  type: AccountTypeSchema,
  institution: z.string().nullable(),
  currency: CurrencyCodeSchema,
  archivedAt: IsoTimestampSchema.nullable(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});
export type Account = z.infer<typeof AccountSchema>;

export const InstrumentSchema = z.object({
  id: InstrumentIdSchema,
  symbol: z.string().min(1),
  name: z.string().nullable(),
  kind: InstrumentKindSchema,
  currency: CurrencyCodeSchema.nullable(),
  createdAt: IsoTimestampSchema,
});
export type Instrument = z.infer<typeof InstrumentSchema>;

/** §16.5 invariants: trade fields all-or-none; amount ≠ 0 except 'other'; qty ≠ 0. */
export const TransactionSchema = z
  .object({
    id: TransactionIdSchema,
    accountId: AccountIdSchema,
    batchId: BatchIdSchema,
    date: MarketDateSchema,
    type: TransactionTypeSchema,
    amount: MoneySchema,
    currency: CurrencyCodeSchema,
    instrumentId: InstrumentIdSchema.nullable(),
    quantity: QtySchema.nullable(),
    price: MoneySchema.nullable(),
    description: z.string(),
    sourceLine: z.number().int().nonnegative(),
    supersedesId: TransactionIdSchema.nullable(),
    superseded: z.boolean(),
    createdAt: IsoTimestampSchema,
  })
  .refine(
    (t) =>
      !["buy", "sell"].includes(t.type) ||
      (t.instrumentId !== null && t.quantity !== null && t.price !== null),
    { message: "trade fields (instrument, quantity, price) are all-or-none for buy/sell" },
  )
  .refine((t) => t.quantity === null || t.quantity !== 0n, {
    message: "quantity must be nonzero when present",
  })
  .refine((t) => t.amount !== 0n || t.type === "other", {
    message: "amount must be nonzero except type 'other'",
  })
  .refine((t) => t.supersedesId === null || t.supersedesId !== t.id, {
    message: "a transaction cannot supersede itself",
  });
export type Transaction = z.infer<typeof TransactionSchema>;

export const PositionSchema = z.object({
  instrumentId: InstrumentIdSchema,
  symbol: z.string(),
  kind: InstrumentKindSchema,
  qty: QtySchema,
  costBasis: MoneySchema,
  avgCost: MoneySchema,
  marketValue: MoneySchema,
  unrealizedPnl: MoneySchema.nullable(), // null when flagged
  flags: z.array(PositionFlagSchema),
});
export type Position = z.infer<typeof PositionSchema>;

export const MoneyTotalsSchema = z.object({
  totalValue: MoneySchema,
  cashValue: MoneySchema,
});
export type MoneyTotals = z.infer<typeof MoneyTotalsSchema>;

export const AccountRollupSchema = z.object({
  accountId: AccountIdSchema,
  totalValue: MoneySchema,
  cashValue: MoneySchema,
});
export type AccountRollup = z.infer<typeof AccountRollupSchema>;

/** PerCurrency<T> — record keyed by ISO-4217 code (§16.3 Snapshot.totals). */
export const SnapshotSchema = z.object({
  id: z.string().uuid(),
  asOf: MarketDateSchema,
  computedAt: IsoTimestampSchema,
  schemaVersion: z.number().int().positive(),
  totals: z.record(z.string().regex(/^[A-Z]{3}$/), MoneyTotalsSchema),
  positions: z.array(PositionSchema),
  perAccount: z.array(AccountRollupSchema),
  flags: z.array(SnapshotFlagSchema),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

export const ImportBatchSchema = z.object({
  id: BatchIdSchema,
  workspaceId: WorkspaceIdSchema,
  fileName: z.string().nullable(),
  contentHash: z.string().length(64), // SHA-256 hex
  status: BatchStatusSchema,
  mapping: z.unknown().nullable(), // Zod-validated shape from §15 at the import layer
  stats: z
    .object({
      accepted: z.number().int().nonnegative(),
      rejected: z.number().int().nonnegative(),
      duplicates: z.number().int().nonnegative(),
    })
    .nullable(),
  idempotencyKey: z.string().uuid().nullable(),
  error: z.string().nullable(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});
export type ImportBatch = z.infer<typeof ImportBatchSchema>;

export const AnomalySchema = z.object({
  id: AnomalyIdSchema,
  workspaceId: WorkspaceIdSchema,
  type: z.string().min(1), // detector key, §14 registry
  severity: AnomalySeveritySchema,
  status: AnomalyStatusSchema,
  title: z.string(),
  explanation: z.string().nullable(),
  evidenceTxIds: z.array(TransactionIdSchema).max(100),
  evidenceHash: z.string().min(1),
  detectedBatchId: BatchIdSchema.nullable(),
  statusChangedBy: z.string().nullable(),
  statusChangedAt: IsoTimestampSchema.nullable(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});
export type Anomaly = z.infer<typeof AnomalySchema>;

export const AlertRuleSchema = z.object({
  id: AlertRuleIdSchema,
  workspaceId: WorkspaceIdSchema,
  type: AlertTypeSchema,
  name: z.string().min(1),
  params: z.record(z.unknown()), // per-type Zod schema applied at the §14 layer
  enabled: z.boolean(),
  lastTriggeredAt: IsoTimestampSchema.nullable(),
  triggerCount: z.number().int().nonnegative(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});
export type AlertRule = z.infer<typeof AlertRuleSchema>;

export const NotificationSchema = z.object({
  id: NotificationIdSchema,
  workspaceId: WorkspaceIdSchema,
  alertRuleId: AlertRuleIdSchema.nullable(), // null = system notification
  title: z.string(),
  body: z.string(),
  evidence: z.unknown().nullable(), // drawer descriptor per §03.6.4 contract
  dedupKey: z.string().min(1),
  readAt: IsoTimestampSchema.nullable(),
  createdAt: IsoTimestampSchema,
});
export type Notification = z.infer<typeof NotificationSchema>;

export const InvestigationSchema = z.object({
  id: InvestigationIdSchema,
  workspaceId: WorkspaceIdSchema,
  title: z.string(),
  summary: z.string().nullable(), // rolling, §08.4-4
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});
export type Investigation = z.infer<typeof InvestigationSchema>;

/** §09.3: the §08.12 required fields are not-null for role='assistant'. */
export const MessageSchema = z
  .object({
    id: MessageIdSchema,
    investigationId: InvestigationIdSchema,
    role: MessageRoleSchema,
    content: z.string(),
    stopped: z.boolean(),
    promptVersion: z.string().nullable(),
    model: z.string().nullable(),
    usage: z.unknown().nullable(),
    createdAt: IsoTimestampSchema,
  })
  .refine(
    (m) =>
      m.role !== "assistant" ||
      (m.promptVersion !== null && m.model !== null && m.usage !== null),
    { message: "assistant messages require promptVersion, model, usage (§08.12)" },
  );
export type Message = z.infer<typeof MessageSchema>;

export const MessageCitationSchema = z.object({
  id: z.string().uuid(),
  messageId: MessageIdSchema,
  ord: z.number().int().nonnegative(),
  kind: z.string().min(1),
  refIds: z.array(z.string().uuid()),
  label: z.string().nullable(),
});
export type MessageCitation = z.infer<typeof MessageCitationSchema>;
