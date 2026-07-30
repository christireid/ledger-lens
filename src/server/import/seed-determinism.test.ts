import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

// eslint-disable-next-line no-restricted-imports -- .mjs module, no alias path
import {
  DEMO_SEED_DATE,
  generateDemoDataset,
  generateDemoImportCsv,
} from "../../../supabase/seed/demo-dataset.mjs";
import { autoMap } from "@/server/import/mapping";
import { parseFile } from "@/server/import/parse";
import { validateRows } from "@/server/import/validate";

/**
 * §27.4 M4 gate: seed determinism — two runs, identical output hash.
 * Plus §15.7: the demo import variant's 6 engineered rejects actually reject.
 */

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("demo seed dataset (§15.7)", () => {
  it("two runs produce an identical output hash (byte-stable, §23.10-5)", () => {
    expect(hash(generateDemoDataset())).toBe(hash(generateDemoDataset()));
    expect(hash(generateDemoImportCsv())).toBe(hash(generateDemoImportCsv()));
  });

  it("has the normative shape: 3 accounts, 12 instruments, ~1,400 transactions, fixed seed date", () => {
    const d = generateDemoDataset();
    expect(d.accounts).toHaveLength(3);
    expect(d.instruments).toHaveLength(12);
    expect(d.transactions.length).toBeGreaterThan(1100);
    expect(d.transactions.length).toBeLessThan(1700);
    expect(d.seedDate).toBe(DEMO_SEED_DATE);
  });

  it("contains every planted finding's raw material (D1–D6)", () => {
    const d = generateDemoDataset();
    const tx = d.transactions;
    // D1: duplicated $89.99 pair, 2 days apart
    const d1 = tx.filter((t) => t.amount === "-89.99" && t.description === "FITLIFE GYM ANNUAL");
    expect(d1).toHaveLength(2);
    // D2: 39.95 fee ×3 in one month vs 4.95 baseline
    expect(tx.filter((t) => t.type === "fee" && t.amount === "-39.95")).toHaveLength(3);
    expect(tx.filter((t) => t.type === "fee" && t.amount === "-4.95").length).toBeGreaterThan(12);
    // D3: the $18,500 wire
    expect(tx.some((t) => t.amount === "-18500.00" && t.description.includes("WIRE"))).toBe(true);
    // D5: TSLA sold but never bought
    expect(tx.some((t) => t.type === "sell" && t.symbol === "TSLA")).toBe(true);
    expect(tx.some((t) => t.type === "buy" && t.symbol === "TSLA")).toBe(false);
    // D6: checking silent for 60 days before seed date
    const checkingDates = tx.filter((t) => t.accountKey === "checking").map((t) => t.date);
    expect(checkingDates.every((date) => date < "2026-05-02")).toBe(true);
  });

  it("demo import CSV variant: exactly the 6 engineered rows reject, with the right codes", () => {
    const csv = generateDemoImportCsv();
    const parsed = parseFile(new TextEncoder().encode(csv));
    const { mapping } = autoMap(parsed.headers, parsed.rows);
    const result = validateRows(parsed.headers, parsed.rows, mapping);
    expect(result.rejected.map((r) => r.code)).toEqual([
      "date_unparseable",
      "date_out_of_range",
      "amount_unparseable",
      "amount_zero",
      "sign_conflict",
      "incomplete_trade",
    ]);
  });
});
