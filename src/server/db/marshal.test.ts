import { randomUUID } from "node:crypto";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { TRANSACTION_TYPES } from "@/lib/schemas/enums";
import { TransactionSchema } from "@/lib/schemas/entities";
import { moneyToString, qtyToString } from "@/lib/schemas/primitives";
import {
  transactionFromRow,
  transactionToRow,
  transactionToWire,
} from "@/server/db/marshal";

/**
 * Marshal round-trip — §16.5 invariant table row "money precision ×10⁴" and
 * §16.6 acceptance: entity → wire → entity identity.
 */

const nonZeroMoneyUnits = fc
  .bigInt({ min: -(10n ** 16n), max: 10n ** 16n })
  .filter((v) => v !== 0n);
const nonZeroQtyUnits = fc
  .bigInt({ min: -(10n ** 18n), max: 10n ** 18n })
  .filter((v) => v !== 0n);

const marketDate = fc
  .date({
    min: new Date("1990-01-01T00:00:00Z"),
    max: new Date("2030-12-31T00:00:00Z"),
    noInvalidDate: true,
  })
  .map((d) => d.toISOString().slice(0, 10));

/** Generates a DB-shaped transaction row satisfying the §16.5 invariants. */
const transactionRowArb = fc
  .record({
    type: fc.constantFrom(...TRANSACTION_TYPES),
    amountUnits: nonZeroMoneyUnits,
    qtyUnits: nonZeroQtyUnits,
    priceUnits: nonZeroMoneyUnits,
    date: marketDate,
    description: fc.string({ maxLength: 40 }),
    sourceLine: fc.nat({ max: 100_000 }),
    superseded: fc.boolean(),
    hasInstrument: fc.boolean(),
  })
  .map((r) => {
    const isTrade = r.type === "buy" || r.type === "sell";
    const withInstrument = isTrade || r.hasInstrument;
    return {
      id: randomUUID(),
      workspaceId: randomUUID(),
      accountId: randomUUID(),
      importBatchId: randomUUID(),
      sourceLine: r.sourceLine,
      date: r.date,
      type: r.type,
      amount: moneyToString(r.amountUnits as never),
      currency: "USD",
      instrumentId: withInstrument ? randomUUID() : null,
      quantity: withInstrument ? qtyToString(r.qtyUnits as never) : null,
      price: withInstrument ? moneyToString(r.priceUnits as never) : null,
      description: r.description,
      supersedesId: null,
      superseded: r.superseded,
      createdAt: new Date("2026-01-15T12:00:00.000Z"),
    };
  });

describe("marshal layer (§16.4 — the only numeric-string ↔ bigint boundary)", () => {
  it("row → entity → row identity (property)", () => {
    fc.assert(
      fc.property(transactionRowArb, (row) => {
        const entity = transactionFromRow(row);
        const back = transactionToRow(entity, row.workspaceId);
        expect(back.amount).toBe(row.amount);
        expect(back.quantity).toBe(row.quantity);
        expect(back.price).toBe(row.price);
        expect(back.date).toBe(row.date);
        expect(back.id).toBe(row.id);
        expect(back.workspaceId).toBe(row.workspaceId);
        expect(back.accountId).toBe(row.accountId);
        expect(back.importBatchId).toBe(row.importBatchId);
        expect(back.type).toBe(row.type);
        expect(back.superseded).toBe(row.superseded);
        expect(back.description).toBe(row.description);
      }),
      { numRuns: 200 },
    );
  });

  it("entity → wire → entity identity (property, §16.6)", () => {
    fc.assert(
      fc.property(transactionRowArb, (row) => {
        const entity = transactionFromRow(row);
        const wire = transactionToWire(entity);
        // wire must be JSON-safe: no bigints anywhere (bigint throws in JSON)
        const json = JSON.stringify(wire);
        const reparsed = TransactionSchema.parse({
          ...JSON.parse(json),
        });
        expect(reparsed.amount).toBe(entity.amount);
        expect(reparsed.quantity).toBe(entity.quantity);
        expect(reparsed.price).toBe(entity.price);
      }),
      { numRuns: 200 },
    );
  });

  it("wire format emits decimal strings, never JSON numbers (§17.3)", () => {
    fc.assert(
      fc.property(transactionRowArb, (row) => {
        const wire = transactionToWire(transactionFromRow(row));
        expect(typeof wire.amount).toBe("string");
        expect(wire.quantity === null || typeof wire.quantity === "string").toBe(
          true,
        );
        expect(wire.price === null || typeof wire.price === "string").toBe(true);
      }),
      { numRuns: 50 },
    );
  });
});
