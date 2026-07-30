import { describe, expect, it } from "vitest";

import { autoMap, headerSignature } from "@/server/import/mapping";

/**
 * §15.9: auto-assignment (≥0.8) correctness against 10 real-world broker/bank
 * export header formats (header rows + shaped sample values).
 */

type BrokerCase = {
  name: string;
  headers: string[];
  sample: string[][];
  expect: Partial<Record<string, number>>;
};

const CASES: BrokerCase[] = [
  {
    name: "Fidelity",
    headers: ["Run Date", "Action", "Symbol", "Description", "Type", "Quantity", "Price ($)", "Commission ($)", "Fees ($)", "Amount ($)"],
    sample: [["01/05/2026", "YOU BOUGHT", "AAPL", "APPLE INC", "Cash", "10", "185.05", "0", "0", "-1850.50"]],
    expect: { date: 0, instrument_symbol: 2, quantity: 5, price: 6, amount: 9 },
  },
  {
    name: "Schwab",
    headers: ["Date", "Action", "Symbol", "Description", "Quantity", "Price", "Fees & Comm", "Amount"],
    sample: [["01/05/2026", "Buy", "MSFT", "MICROSOFT CORP", "5", "410.00", "0", "-2050.00"]],
    expect: { date: 0, instrument_symbol: 2, quantity: 4, price: 5, amount: 7 },
  },
  {
    name: "Vanguard",
    headers: ["Trade Date", "Settlement Date", "Transaction Type", "Transaction Description", "Investment Name", "Symbol", "Shares", "Share Price", "Principal Amount"],
    sample: [["2026-01-05", "2026-01-07", "Buy", "VANGUARD TOTAL STOCK", "VTI", "VTI", "4", "260.00", "-1040.00"]],
    expect: { date: 0, quantity: 6, price: 7 },
  },
  {
    name: "Chase",
    headers: ["Posting Date", "Description", "Amount", "Type", "Balance", "Check or Slip #"],
    sample: [["01/05/2026", "ACME PAYROLL", "2500.00", "ACH_CREDIT", "8100.00", ""]],
    expect: { date: 0, description: 1, amount: 2, type: 3 },
  },
  {
    name: "Amex",
    headers: ["Date", "Description", "Amount"],
    sample: [["01/05/2026", "NETFLIX.COM", "15.49"]],
    expect: { date: 0, description: 1, amount: 2 },
  },
  {
    name: "BofA",
    headers: ["Date", "Description", "Amount", "Running Bal."],
    sample: [["01/05/2026", "GROCERY MART", "-82.13", "1500.00"]],
    expect: { date: 0, description: 1, amount: 2 },
  },
  {
    name: "Wells Fargo",
    headers: ["Date", "Amount", "*", "Check Number", "Description"],
    sample: [["01/05/2026", "-82.13", "", "", "GROCERY MART"]],
    expect: { date: 0, amount: 1, description: 4 },
  },
  {
    name: "Robinhood",
    headers: ["Activity Date", "Process Date", "Settle Date", "Instrument", "Description", "Trans Code", "Quantity", "Price", "Amount"],
    sample: [["01/05/2026", "01/05/2026", "01/07/2026", "AAPL", "Apple", "Buy", "10", "185.05", "-1850.50"]],
    expect: { date: 0, quantity: 6, price: 7, amount: 8 },
  },
  {
    name: "E*Trade",
    headers: ["TransactionDate", "TransactionType", "SecurityType", "Symbol", "Quantity", "Amount", "Price", "Commission", "Description"],
    sample: [["01/05/2026", "Bought", "EQ", "NVDA", "8", "-960.00", "120.00", "0", "NVIDIA CORP"]],
    expect: { date: 0, instrument_symbol: 3, quantity: 4, amount: 5, price: 6 },
  },
  {
    name: "Capital One",
    headers: ["Transaction Date", "Posted Date", "Card No.", "Description", "Category", "Debit", "Credit"],
    sample: [["01/05/2026", "01/06/2026", "1234", "STARBUCKS", "Dining", "6.75", ""]],
    expect: { date: 0, description: 3 },
  },
];

describe("broker header auto-mapping (§15.9 — 10 real-world formats)", () => {
  for (const brokerCase of CASES) {
    it(`${brokerCase.name}: every expected field auto-assigns at ≥0.8`, () => {
      const rows = Array.from({ length: 20 }, () => [...brokerCase.sample[0]!]);
      const { mapping } = autoMap(brokerCase.headers, rows);
      for (const [field, col] of Object.entries(brokerCase.expect)) {
        expect(
          mapping[field as keyof typeof mapping],
          `${brokerCase.name}.${field}`,
        ).toBe(col);
      }
    });
  }

  it("header signatures are stable and distinct", () => {
    const signatures = CASES.map((c) => headerSignature(c.headers));
    expect(new Set(signatures).size).toBe(CASES.length);
    expect(headerSignature(["Date", "Amount"])).toBe(
      headerSignature(["date", "AMOUNT "]),
    );
  });
});
