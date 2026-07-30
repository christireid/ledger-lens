import path from "node:path";
import { defineConfig } from "vitest/config";

// Integration suite — runs against the local/CI Postgres (§22, §23.3).
// Requires DATABASE_URL/DIRECT_URL; fails loudly without them.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    include: ["src/**/*.integration.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    // DB tests share one database — serialize files to keep fixtures honest.
    fileParallelism: false,
  },
});
