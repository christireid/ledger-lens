import { z } from "zod";

/**
 * Branded primitives — spec §16.2. This module is the dictionary; if a type
 * name here disagrees with any other section, section 16 wins (§16.1).
 */

// --- IDs (bare UUIDs internally; prefixed public IDs only in the §17 layer) ---
export const WorkspaceIdSchema = z.string().uuid().brand<"WorkspaceId">();
export const AccountIdSchema = z.string().uuid().brand<"AccountId">();
export const TransactionIdSchema = z.string().uuid().brand<"TransactionId">();
export const InstrumentIdSchema = z.string().uuid().brand<"InstrumentId">();
export const BatchIdSchema = z.string().uuid().brand<"BatchId">();
export const AnomalyIdSchema = z.string().uuid().brand<"AnomalyId">();
export const AlertRuleIdSchema = z.string().uuid().brand<"AlertRuleId">();
export const NotificationIdSchema = z.string().uuid().brand<"NotificationId">();
export const InvestigationIdSchema = z
  .string()
  .uuid()
  .brand<"InvestigationId">();
export const MessageIdSchema = z.string().uuid().brand<"MessageId">();

export type WorkspaceId = z.infer<typeof WorkspaceIdSchema>;
export type AccountId = z.infer<typeof AccountIdSchema>;
export type TransactionId = z.infer<typeof TransactionIdSchema>;
export type InstrumentId = z.infer<typeof InstrumentIdSchema>;
export type BatchId = z.infer<typeof BatchIdSchema>;
export type AnomalyId = z.infer<typeof AnomalyIdSchema>;
export type AlertRuleId = z.infer<typeof AlertRuleIdSchema>;
export type NotificationId = z.infer<typeof NotificationIdSchema>;
export type InvestigationId = z.infer<typeof InvestigationIdSchema>;
export type MessageId = z.infer<typeof MessageIdSchema>;

/** Public API ID prefixes — mapped to/from bare UUIDs exclusively in §17. */
export const ID_PREFIXES = {
  workspace: "wsp_",
  account: "acc_",
  transaction: "txn_",
  batch: "batch_",
  anomaly: "anm_",
  alertRule: "alr_",
  notification: "ntf_",
  investigation: "inv_",
  message: "msg_",
} as const;

// --- Money & quantity (§16.2) ---
// Money = bigint minor units ×10⁴; Qty = bigint ×10⁸. Wire format: decimal
// STRINGS ("1234.5000") — JSON numbers banned for money (precision, §17.3).
declare const MoneyBrand: unique symbol;
declare const QtyBrand: unique symbol;
export type Money = bigint & { readonly [MoneyBrand]: "Money" };
export type Qty = bigint & { readonly [QtyBrand]: "Qty" };

export const MONEY_SCALE = 4;
export const QTY_SCALE = 8;

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/** Parse a decimal string (or integer number) exactly into scaled bigint — no float intermediate. */
function parseScaled(input: string | number, scale: number): bigint {
  const s = typeof input === "number" ? input.toString() : input.trim();
  if (!DECIMAL_RE.test(s)) {
    throw new Error(`Invalid decimal string: "${s}"`);
  }
  const negative = s.startsWith("-");
  const unsigned = negative ? s.slice(1) : s;
  const [wholeRaw, fracRaw = ""] = unsigned.split(".");
  const whole = wholeRaw ?? "0";
  if (fracRaw.length > scale) {
    // Excess precision is a caller error — never silently round money.
    throw new Error(
      `Decimal "${s}" exceeds scale ${scale} (${fracRaw.length} fractional digits)`,
    );
  }
  const frac = fracRaw.padEnd(scale, "0");
  const value = BigInt(whole) * 10n ** BigInt(scale) + BigInt(frac);
  return negative ? -value : value;
}

function formatScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(scale);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(scale, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/** Construct Money from an exact decimal string (or integer number). */
export function money(input: string | number): Money {
  return parseScaled(input, MONEY_SCALE) as Money;
}

/** Construct Qty from an exact decimal string. */
export function qty(input: string | number): Qty {
  return parseScaled(input, QTY_SCALE) as Qty;
}

/** Wire/DB format: decimal string with 4 fractional digits ("1234.5000"). */
export function moneyToString(value: Money): string {
  return formatScaled(value, MONEY_SCALE);
}

/** Wire/DB format: decimal string with 8 fractional digits. */
export function qtyToString(value: Qty): string {
  return formatScaled(value, QTY_SCALE);
}

/** Zod wire schema: decimal string → Money. */
export const MoneySchema = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, "money must be a decimal string, ≤4 dp")
  .transform((s) => money(s));

/** Zod wire schema: decimal string → Qty. */
export const QtySchema = z
  .string()
  .regex(/^-?\d+(\.\d{1,8})?$/, "quantity must be a decimal string, ≤8 dp")
  .transform((s) => qty(s));

// --- Currency (§16.2) ---
export const CurrencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "ISO-4217 uppercase")
  .brand<"CurrencyCode">();
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

// --- Dates (§16.2, §02.8-5 market-date semantics) ---
export const MarketDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), {
    message: "not a real calendar date",
  })
  .brand<"MarketDate">();
export type MarketDate = z.infer<typeof MarketDateSchema>;

export const IsoTimestampSchema = z
  .string()
  .datetime({ offset: true })
  .brand<"IsoTimestamp">();
export type IsoTimestamp = z.infer<typeof IsoTimestampSchema>;
