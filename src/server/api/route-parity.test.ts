import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { API_INVENTORY } from "@/lib/api-inventory";

/**
 * Route-walk parity test — §17.5: every §17.2 endpoint exists in code and
 * vice versa. Plus §18.8: every route handler is wrapped in withApi (the
 * enumerated non-session routes are the only exemptions).
 */

const API_DIR = path.resolve(__dirname, "../../app/api");

function walkRoutes(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkRoutes(full, `${prefix}${entry}/`));
    } else if (entry === "route.ts") {
      out.push(`${prefix}route.ts`);
    }
  }
  return out;
}

describe("route-walk parity (§17.5)", () => {
  const filesOnDisk = walkRoutes(API_DIR).sort();
  const filesInInventory = [...new Set(API_INVENTORY.map((r) => r.routeFile))].sort();

  it("every inventory row's route file exists on disk", () => {
    for (const file of filesInInventory) {
      expect(filesOnDisk, file).toContain(file);
    }
  });

  it("every route file on disk appears in the inventory", () => {
    for (const file of filesOnDisk) {
      expect(filesInInventory, file).toContain(file);
    }
  });

  it("every inventory method is exported by its route file", () => {
    for (const row of API_INVENTORY) {
      const source = readFileSync(path.join(API_DIR, row.routeFile), "utf8");
      expect(
        source.includes(`export const ${row.method} =`) ||
          source.includes(`export async function ${row.method}`),
        `${row.method} ${row.path} missing in ${row.routeFile}`,
      ).toBe(true);
    }
  });

  it("§18.8: session routes are wrapped in withApi; exemptions are enumerated", () => {
    const exempt = new Set(
      API_INVENTORY.filter((r) => r.auth !== "session").map((r) => r.routeFile),
    );
    for (const file of filesOnDisk) {
      const source = readFileSync(path.join(API_DIR, file), "utf8");
      if (exempt.has(file)) continue;
      expect(source.includes("withApi("), `${file} must use withApi`).toBe(true);
    }
  });
});
