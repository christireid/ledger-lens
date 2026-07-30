import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

/**
 * DDL snapshot / schema-drift gate — §09.10: the Drizzle schema must compile
 * to SQL that matches the committed migrations. We copy the committed
 * migration set to a temp dir and re-run drizzle-kit generate against it; any
 * newly generated migration file means the schema drifted from the committed
 * DDL without a migration.
 */

const root = path.resolve(__dirname, "../../..");
const tmp = mkdtempSync(path.join(tmpdir(), "ledger-lens-ddl-"));

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("DDL snapshot (§09.10 schema drift gate)", () => {
  it("drizzle schema produces no migration beyond the committed set", () => {
    cpSync(path.join(root, "supabase/migrations"), tmp, { recursive: true });
    const before = readdirSync(tmp).filter((f) => f.endsWith(".sql")).length;

    execFileSync(
      "pnpm",
      [
        "drizzle-kit",
        "generate",
        "--dialect",
        "postgresql",
        "--schema",
        "./src/server/db/schema/index.ts",
        "--out",
        tmp,
      ],
      { cwd: root, stdio: "pipe" },
    );

    const after = readdirSync(tmp).filter((f) => f.endsWith(".sql")).length;
    expect(after, "schema drifted from committed migrations — run pnpm db:generate and commit the SQL").toBe(before);
  });
});
