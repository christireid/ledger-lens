import { z } from "zod";

import { ANOMALY_STATUSES, TRANSACTION_TYPES } from "@/lib/schemas/enums";

/**
 * Per-endpoint request schemas — §16.4/§17.2. Unknown body fields rejected
 * (.strict()); unknown query params ignored (asymmetry intentional, §17.5).
 */

export const RANGE_KEYS = ["30d", "90d", "1y", "ytd", "all"] as const;
export const RangeKeySchema = z.enum(RANGE_KEYS);
export type RangeKey = z.infer<typeof RangeKeySchema>;

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const decimalStr = z.string().regex(/^-?\d+(\.\d{1,4})?$/);
const limit = z.coerce.number().int().min(1).max(200).default(50);

export const DashboardQuerySchema = z.object({
  range: RangeKeySchema.default("90d"),
});

export const TransactionsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit,
  sort: z.enum(["date", "amount"]).default("date"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  accountIds: z.string().optional(), // comma-separated public ids
  from: dateStr.optional(),
  to: dateStr.optional(),
  types: z.string().optional(), // comma-separated TransactionType
  minAmount: decimalStr.optional(),
  maxAmount: decimalStr.optional(),
  q: z.string().max(200).optional(),
  includeArchived: z.coerce.boolean().optional(),
  includeSuperseded: z.coerce.boolean().optional(),
});

export const TxInputSchema = z
  .object({
    date: dateStr,
    type: z.enum(TRANSACTION_TYPES),
    amount: decimalStr,
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    symbol: z.string().regex(/^[A-Za-z.]{1,6}$/).optional(),
    quantity: z.string().regex(/^-?\d+(\.\d{1,8})?$/).optional(),
    price: decimalStr.optional(),
    description: z.string().max(500).default(""),
  })
  .strict();

export const SupersedeBodySchema = z.object({ correction: TxInputSchema }).strict();

export const AccountInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    type: z.enum(["brokerage", "bank", "card", "other"]),
    institution: z.string().max(120).optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).default("USD"),
  })
  .strict();

export const AccountPatchSchema = AccountInputSchema.partial().strict();

export const AccountsQuerySchema = z.object({
  includeArchived: z.coerce.boolean().optional(),
});

export const SeriesQuerySchema = z.object({
  range: RangeKeySchema.default("90d"),
  downsample: z.coerce.boolean().optional(),
});

export const AnomaliesQuerySchema = z.object({
  status: z.enum(ANOMALY_STATUSES).optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
  cursor: z.string().optional(),
  limit,
});

export const AnomalyStatusBodySchema = z
  .object({
    status: z.enum(ANOMALY_STATUSES),
    note: z.string().max(500).optional(),
  })
  .strict();

export const AnomalyBulkStatusSchema = z
  .object({
    ids: z.array(z.string()).min(1).max(200),
    status: z.literal("acknowledged"), // acknowledge-only (§05.6)
  })
  .strict();

/** §14.3 per-type params — S-08 forms generate from these (one source of truth). */
export const AlertParamsSchemas = {
  large_transaction: z
    .object({ threshold: decimalStr })
    .strict(),
  fee_spike: z
    .object({
      sigma: z.number().min(1).max(4).default(2),
      minMonths: z.number().int().min(3).max(12).default(3),
    })
    .strict(),
  allocation_drift: z
    .object({
      driftPp: z.number().min(1).max(50).default(5),
      baselineDays: z.number().int().min(30).max(365).default(90),
    })
    .strict(),
  account_inactivity: z
    .object({ days: z.number().int().min(7).max(365).default(45) })
    .strict(),
} as const;

export const AlertRuleInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("large_transaction"), name: z.string().min(1).max(120), enabled: z.boolean().default(true), params: AlertParamsSchemas.large_transaction }).strict(),
  z.object({ type: z.literal("fee_spike"), name: z.string().min(1).max(120), enabled: z.boolean().default(true), params: AlertParamsSchemas.fee_spike }).strict(),
  z.object({ type: z.literal("allocation_drift"), name: z.string().min(1).max(120), enabled: z.boolean().default(true), params: AlertParamsSchemas.allocation_drift }).strict(),
  z.object({ type: z.literal("account_inactivity"), name: z.string().min(1).max(120), enabled: z.boolean().default(true), params: AlertParamsSchemas.account_inactivity }).strict(),
]);
export type AlertRuleInput = z.infer<typeof AlertRuleInputSchema>;

export const AlertRulePatchSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    enabled: z.boolean().optional(),
    params: z.record(z.unknown()).optional(), // re-validated per-type in service
  })
  .strict();

export const NotificationsReadSchema = z
  .union([
    z.object({ ids: z.array(z.string()).min(1) }).strict(),
    z.object({ all: z.literal(true) }).strict(),
  ]);

export const CursorQuerySchema = z.object({
  cursor: z.string().optional(),
  limit,
});

export const InvestigationPatchSchema = z
  .object({ title: z.string().min(1).max(200) })
  .strict();

export const MessageBodySchema = z
  .object({ content: z.string().min(1).max(4000) })
  .strict();

export const FeedbackBodySchema = z
  .object({ value: z.union([z.literal(1), z.literal(-1)]) })
  .strict();

export const ImportMappingBodySchema = z
  .object({ mapping: z.record(z.string(), z.number().int().nonnegative()) })
  .strict();

export const ImportCommitBodySchema = z
  .object({
    accountId: z.string(),
    crossDupeDecision: z.enum(["skip", "import"]).optional(),
  })
  .strict();

export const WorkspacePatchSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    baseCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
  })
  .strict();

export const DemoActionSchema = z
  .object({ action: z.enum(["seed", "clear"]) })
  .strict();
