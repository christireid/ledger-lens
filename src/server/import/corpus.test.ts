import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { autoMap, type Mapping } from "@/server/import/mapping";
import { FileRejectError, parseFile } from "@/server/import/parse";
import { validateRows } from "@/server/import/validate";

/**
 * 40-file adversarial corpus — §15.9: every §15.2/§15.4/§15.8 case committed
 * under fixtures/imports/ with expected outcomes; CI runs the full corpus
 * through the dry-run pipeline.
 */

const CORPUS_DIR = path.resolve(__dirname, "../../../fixtures/imports");

type Expected = {
  fileReject?: string;
  syntheticHeaders?: boolean;
  mapping?: Mapping;
  accepted?: number;
  rejected?: Array<{ line: number; code: string }>;
  intraFileDuplicates?: number[];
  typeTally?: Record<string, number>;
  euLocaleColumns?: string[];
  acceptedAmounts?: string[];
  acceptedDates?: string[];
  acceptedTypes?: string[];
  acceptedSymbols?: string[];
  acceptedDescriptions?: string[];
  signAutocorrected?: number[];
  descriptionMaxLen?: number;
};

const cases = readdirSync(CORPUS_DIR)
  .filter((f) => f.endsWith(".csv"))
  .sort();

describe("adversarial import corpus (§15.9)", () => {
  it("has the full 40-file corpus", () => {
    expect(cases.length).toBe(40);
  });

  for (const file of cases) {
    const name = file.replace(/\.csv$/, "");
    it(name, () => {
      const buf = new Uint8Array(readFileSync(path.join(CORPUS_DIR, file)));
      const expected: Expected = JSON.parse(
        readFileSync(path.join(CORPUS_DIR, `${name}.expected.json`), "utf8"),
      );

      if (expected.fileReject) {
        try {
          parseFile(buf);
          expect.fail(`expected whole-file reject ${expected.fileReject}`);
        } catch (err) {
          if (!(err instanceof FileRejectError)) throw err;
          expect(err.code).toBe(expected.fileReject);
        }
        return;
      }

      const parsed = parseFile(buf);
      if (expected.syntheticHeaders !== undefined) {
        expect(parsed.syntheticHeaders).toBe(expected.syntheticHeaders);
      }
      const mapping =
        expected.mapping ?? autoMap(parsed.headers, parsed.rows).mapping;
      expect(mapping.date, "date must be mapped").toBeDefined();
      expect(mapping.amount, "amount must be mapped").toBeDefined();

      const result = validateRows(parsed.headers, parsed.rows, mapping);

      if (expected.accepted !== undefined) {
        expect(result.accepted.length, "accepted count").toBe(expected.accepted);
      }
      if (expected.rejected !== undefined) {
        expect(
          result.rejected.map((r) => ({ line: r.line, code: r.code })),
        ).toEqual(expected.rejected);
      }
      if (expected.intraFileDuplicates !== undefined) {
        expect(result.intraFileDuplicates).toEqual(expected.intraFileDuplicates);
      }
      if (expected.typeTally !== undefined) {
        expect(result.typeTally).toEqual(expected.typeTally);
      }
      if (expected.euLocaleColumns !== undefined) {
        expect(result.euLocaleColumns).toEqual(expected.euLocaleColumns);
      }
      if (expected.acceptedAmounts !== undefined) {
        expect(result.accepted.map((r) => r.amount)).toEqual(expected.acceptedAmounts);
      }
      if (expected.acceptedDates !== undefined) {
        expect(result.accepted.map((r) => r.date)).toEqual(expected.acceptedDates);
      }
      if (expected.acceptedTypes !== undefined) {
        expect(result.accepted.map((r) => r.type)).toEqual(expected.acceptedTypes);
      }
      if (expected.acceptedSymbols !== undefined) {
        expect(result.accepted.map((r) => r.symbol)).toEqual(expected.acceptedSymbols);
      }
      if (expected.acceptedDescriptions !== undefined) {
        expect(result.accepted.map((r) => r.description)).toEqual(
          expected.acceptedDescriptions,
        );
      }
      if (expected.signAutocorrected !== undefined) {
        expect(
          result.accepted.filter((r) => r.signAutocorrected).map((r) => r.line),
        ).toEqual(expected.signAutocorrected);
      }
      if (expected.descriptionMaxLen !== undefined) {
        for (const row of result.accepted) {
          expect(row.description.length).toBeLessThanOrEqual(expected.descriptionMaxLen);
        }
      }
    });
  }

  it("rejects an oversize file (cap generated at test time, not committed)", () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.fill(97);
    expect(() => parseFile(big)).toThrow(/10 MB/);
  });

  it("rejects a 50,001-row file with the count in the message (§15.8-5)", () => {
    const lines = ["Date,Description,Amount"];
    for (let i = 0; i < 50_001; i++) {
      lines.push(`2026-01-05,ROW ${i},-1.00`);
    }
    try {
      parseFile(new TextEncoder().encode(lines.join("\n")));
      expect.fail("expected file_too_many_rows");
    } catch (err) {
      if (!(err instanceof FileRejectError)) throw err;
      expect(err.code).toBe("file_too_many_rows");
      expect(err.message).toContain("50,001");
    }
  });
});
