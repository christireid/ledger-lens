import { REJECT_CODES, type RejectCode, type TransactionType } from "@/lib/schemas/enums";
import type { Mapping } from "@/server/import/mapping";

/**
 * Row validation & normalization (dry-run) — §15.4. Per row, in order; first
 * failure rejects with {line, field, code, message, raw}. Reject codes are the
 * closed §16 enum.
 */

export type RejectedRow = {
  line: number; // 1-based data-row line number (excluding header)
  field: string;
  code: RejectCode;
  message: string;
  raw: string[];
};

export type NormalizedRow = {
  line: number;
  date: string; // YYYY-MM-DD
  type: TransactionType;
  typeWasDefaulted: boolean; // unmapped source value → 'other' (§15.4-3 tally)
  amount: string; // decimal string, signed, ≤4 dp
  currency: string | null; // null → workspace default at commit
  symbol: string | null;
  quantity: string | null; // ≤8 dp
  price: string | null;
  description: string;
  accountHint: string | null;
  signAutocorrected: boolean;
};

export type DryRunResult = {
  accepted: NormalizedRow[];
  rejected: RejectedRow[];
  /** §15.4 duplicate layers */
  intraFileDuplicates: number[]; // line numbers auto-skipped
  typeTally: Record<string, number>; // per-batch lossy-typing tally for Preview
  euLocaleColumns: string[]; // columns parsed with EU decimal convention
};

const TYPE_DICTIONARY: Record<string, TransactionType> = {
  buy: "buy", bought: "buy", purchase: "buy", "you bought": "buy", reinvestment: "buy",
  sell: "sell", sold: "sell", sale: "sell", "you sold": "sell",
  dividend: "dividend", div: "dividend", "cash dividend": "dividend", "qualified dividend": "dividend",
  interest: "interest", "interest income": "interest", int: "interest",
  deposit: "deposit", "web ach": "deposit", ach: "deposit", "direct deposit": "deposit",
  "electronic funds transfer received": "deposit", contribution: "deposit", credit: "deposit",
  withdrawal: "withdrawal", "atm withdrawal": "withdrawal", debit: "withdrawal",
  "electronic funds transfer paid": "withdrawal",
  fee: "fee", "service fee": "fee", commission: "fee", "management fee": "fee", "advisory fee": "fee",
  "transfer in": "transfer_in", transfer_in: "transfer_in", "acat in": "transfer_in",
  "transfer out": "transfer_out", transfer_out: "transfer_out", "acat out": "transfer_out",
  other: "other", adjustment: "other", journal: "other",
};

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** §15.4-1: formats tried in order; ISO datetime keeps the date part (§02.8-5). */
export function parseDate(value: string): string | null {
  const v = value.trim();
  let y: string | undefined, m: string | undefined, d: string | undefined;
  let match: RegExpExecArray | null;
  if ((match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v))) {
    [, y, m, d] = match;
  } else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v))) {
    [, m, d, y] = match; // MM/DD/YYYY
  } else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(v))) {
    const [, mm, dd, yy] = match;
    m = mm; d = dd;
    y = String(2000 + Number(yy)); // M/D/YY
  } else if ((match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(v))) {
    const [, dd, mon, yyyy] = match;
    const mm = MONTHS[(mon ?? "").toLowerCase()];
    if (!mm) return null;
    y = yyyy; m = mm; d = dd;
  } else if ((match = /^(\d{4})-(\d{2})-(\d{2})[T ]\d{2}:\d{2}/.exec(v))) {
    [, y, m, d] = match;
  } else {
    return null;
  }
  const iso = `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Reject silent rollover (e.g. 2026-02-31 → Mar 3)
  if (parsed.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

/** §15.4-2 + §15.8-3: strip symbols/thousands; parens = negative; EU per-column. */
export function parseAmount(value: string, euLocale: boolean): string | null {
  let v = value.trim();
  if (v === "") return null;
  let negative = false;
  if (/^\(.*\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1).trim();
  }
  // Currency symbols may sit before or after the sign — strip them first.
  v = v.replace(/[$€£\s]/g, "");
  if (v.startsWith("-")) {
    negative = true;
    v = v.slice(1);
  } else if (v.startsWith("+")) {
    v = v.slice(1);
  }
  if (euLocale) {
    v = v.replace(/\./g, "").replace(",", ".");
  } else {
    v = v.replace(/,/g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  // clamp precision to 4 dp — never silently round money: reject beyond 4
  const [, frac = ""] = v.split(".");
  if (frac.length > 4) return null;
  const normalized = Number.parseFloat(v) === 0 ? "0" : v;
  return (negative && normalized !== "0" ? `-${v}` : v).replace(/^(-?)0+(\d)/, "$1$2");
}

/** EU-locale per-column heuristic (§15.8-3): >50% of values match EU pattern. */
export function detectEuLocale(values: string[]): boolean {
  const sample = values.filter((v) => v.trim() !== "").slice(0, 200);
  if (sample.length === 0) return false;
  const eu = sample.filter((v) => /^\(?-?[\d.]+,\d{1,2}\)?$/.test(v.trim())).length;
  return eu / sample.length > 0.5;
}

const SYMBOL_PATTERN = /^[A-Z.]{1,6}$/;
const ISO_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "SEK", "NOK", "DKK", "NZD",
  "HKD", "SGD", "MXN", "BRL", "INR", "CNY", "KRW", "PLN", "ZAR",
]);

export function validateRows(
  headers: string[],
  rows: string[][],
  mapping: Mapping,
): DryRunResult {
  const accepted: NormalizedRow[] = [];
  const rejected: RejectedRow[] = [];
  const typeTally: Record<string, number> = {};
  const seenExact = new Set<string>();
  const intraFileDuplicates: number[] = [];
  const euLocaleColumns: string[] = [];

  const col = (row: string[], field: keyof Mapping): string => {
    const idx = mapping[field];
    return idx === undefined ? "" : (row[idx] ?? "");
  };

  // Per-column EU-locale detection for the numeric fields (never per-row).
  const euFor: Partial<Record<keyof Mapping, boolean>> = {};
  for (const field of ["amount", "quantity", "price"] as const) {
    const idx = mapping[field];
    if (idx !== undefined) {
      const eu = detectEuLocale(rows.map((r) => r[idx] ?? ""));
      euFor[field] = eu;
      if (eu) euLocaleColumns.push(headers[idx] ?? `col_${idx + 1}`);
    }
  }

  const reject = (
    line: number,
    field: string,
    code: RejectCode,
    message: string,
    raw: string[],
  ) => rejected.push({ line, field, code, message, raw });

  const today = new Date();
  const maxDate = new Date(Date.UTC(today.getUTCFullYear() + 1, today.getUTCMonth(), today.getUTCDate()))
    .toISOString()
    .slice(0, 10);

  rows.forEach((raw, i) => {
    const line = i + 1;

    // 1. date
    const dateRaw = col(raw, "date");
    const date = parseDate(dateRaw);
    if (!date) {
      reject(line, "date", "date_unparseable", `Could not parse date "${dateRaw}".`, raw);
      return;
    }
    if (date < "1990-01-01" || date > maxDate) {
      reject(line, "date", "date_out_of_range", `Date ${date} is outside 1990-01-01..${maxDate}.`, raw);
      return;
    }

    // 2. amount
    const amountRaw = col(raw, "amount");
    const amountParsed = parseAmount(amountRaw, euFor.amount ?? false);
    if (amountParsed === null) {
      reject(line, "amount", "amount_unparseable", `Could not parse amount "${amountRaw}".`, raw);
      return;
    }

    // 3. type (before amount_zero: zero is legal only for 'other', §09 checks)
    const typeRaw = col(raw, "type").toLowerCase().trim();
    const mapped = typeRaw === "" ? undefined : TYPE_DICTIONARY[typeRaw];
    const type: TransactionType = mapped ?? "other";
    const typeWasDefaulted = mapped === undefined && typeRaw !== "";
    if (typeWasDefaulted) typeTally[typeRaw] = (typeTally[typeRaw] ?? 0) + 1;

    if (Number.parseFloat(amountParsed) === 0 && type !== "other") {
      reject(line, "amount", "amount_zero", "Amount is zero.", raw);
      return;
    }

    // 4. instrument fields — all-or-none for trades (§15.4-4)
    const symbolRaw = col(raw, "instrument_symbol").trim();
    const qtyRaw = col(raw, "quantity").trim();
    const priceRaw = col(raw, "price").trim();
    const anyTrade = symbolRaw !== "" || qtyRaw !== "" || priceRaw !== "";
    let symbol: string | null = null;
    let quantity: string | null = null;
    let price: string | null = null;

    if (type === "buy" || type === "sell" || anyTrade) {
      if (symbolRaw === "" || qtyRaw === "" || priceRaw === "") {
        reject(line, "instrument", "incomplete_trade",
          "Trades need symbol, quantity, and price together.", raw);
        return;
      }
      symbol = symbolRaw.toUpperCase();
      if (!SYMBOL_PATTERN.test(symbol)) {
        reject(line, "instrument_symbol", "incomplete_trade",
          `"${symbolRaw}" is not a valid ticker symbol.`, raw);
        return;
      }
      quantity = parseAmount(qtyRaw, euFor.quantity ?? false);
      price = parseAmount(priceRaw, euFor.price ?? false);
      if (quantity === null || price === null || Number.parseFloat(quantity) === 0) {
        reject(line, "quantity", "incomplete_trade",
          "Quantity/price must be nonzero numbers.", raw);
        return;
      }
    }

    // Sign convention (§15.4-3): buy negative, sell positive; auto-correct when
    // quantity+price agree with |amount|, else sign_conflict.
    let amount = amountParsed;
    let signAutocorrected = false;
    if (type === "buy" || type === "sell") {
      const negative = amount.startsWith("-");
      const wrongSign = type === "buy" ? !negative : negative;
      if (wrongSign) {
        const expected = Math.abs(Number.parseFloat(quantity!) * Number.parseFloat(price!));
        const actual = Math.abs(Number.parseFloat(amount));
        const tolerance = Math.max(0.02, expected * 0.005);
        if (Math.abs(expected - actual) <= tolerance) {
          amount = negative ? amount.slice(1) : `-${amount}`;
          signAutocorrected = true;
        } else {
          reject(line, "amount", "sign_conflict",
            `${type === "buy" ? "Buys" : "Sells"} must be ${type === "buy" ? "negative" : "positive"}; amount disagrees with quantity×price.`, raw);
          return;
        }
      }
    }

    // 5. currency
    const currencyRaw = col(raw, "currency").trim();
    let currency: string | null = null;
    if (currencyRaw !== "") {
      const upper = currencyRaw.toUpperCase();
      if (!ISO_CURRENCIES.has(upper)) {
        reject(line, "currency", "currency_unknown", `Unknown currency code "${currencyRaw}".`, raw);
        return;
      }
      currency = upper;
    }

    // 6. description: trimmed, control chars stripped, ≤500 (truncate, don't reject)
    let description = col(raw, "description")
      // eslint-disable-next-line no-control-regex -- §15.4-6: strip control chars
      .replace(/[\x00-\x1f\x7f]/g, "")
      .trim();
    if (description.length > 500) description = `${description.slice(0, 499)}…`;

    const normalized: NormalizedRow = {
      line,
      date,
      type,
      typeWasDefaulted,
      amount,
      currency,
      symbol,
      quantity,
      price,
      description,
      accountHint: col(raw, "account_hint").trim() || null,
      signAutocorrected,
    };

    // Intra-file exact dupes: all mapped fields identical → auto-skip (§15.4).
    const exactKey = JSON.stringify([
      normalized.date, normalized.type, normalized.amount, normalized.currency,
      normalized.symbol, normalized.quantity, normalized.price,
      normalized.description, normalized.accountHint,
    ]);
    if (seenExact.has(exactKey)) {
      intraFileDuplicates.push(line);
      return;
    }
    seenExact.add(exactKey);
    accepted.push(normalized);
  });

  return { accepted, rejected, intraFileDuplicates, typeTally, euLocaleColumns };
}

export { REJECT_CODES };
