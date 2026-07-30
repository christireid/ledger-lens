import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { MarketDate } from "@/lib/schemas";
import { GOLDEN_CASES, resetSeq } from "@/server/engine/portfolio/golden/cases";
import { lastTradePricingSource } from "@/server/engine/portfolio/pricing";
import { serializeSnapshot } from "@/server/engine/portfolio/serialize";
import { computeSnapshot } from "@/server/engine/portfolio/snapshot";

/**
 * Golden-file suite — §12.8: expected-output JSON committed; any diff fails
 * CI. Regenerate deliberately with UPDATE_GOLDEN=1 (a diff in the PR is the
 * review surface; changing a golden without changing engine code is the smell
 * the suite exists to catch).
 */

const GOLDEN_DIR = path.join(__dirname, "golden", "expected");

describe("golden-file suite (§12.8)", () => {
  for (const goldenCase of GOLDEN_CASES) {
    it(goldenCase.name, () => {
      resetSeq();
      const transactions = goldenCase.build();
      const snapshot = computeSnapshot(
        transactions,
        goldenCase.asOf as MarketDate,
        lastTradePricingSource(transactions),
      );
      const actual = serializeSnapshot(snapshot);
      const file = path.join(GOLDEN_DIR, `${goldenCase.name}.json`);

      if (process.env.UPDATE_GOLDEN === "1") {
        mkdirSync(GOLDEN_DIR, { recursive: true });
        writeFileSync(file, JSON.stringify(actual, null, 2) + "\n");
      }

      expect(
        existsSync(file),
        `golden file missing: ${file} (run UPDATE_GOLDEN=1 deliberately)`,
      ).toBe(true);
      const expected = JSON.parse(readFileSync(file, "utf8"));
      expect(actual).toEqual(expected);
    });
  }
});
