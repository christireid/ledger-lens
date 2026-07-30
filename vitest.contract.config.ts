import path from "node:path";
import { defineConfig } from "vitest/config";

// Contract suite (§17.5) — generated requests against real handlers + local DB.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    include: ["src/**/*.contract.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    fileParallelism: false,
    env: {
      // §20.8 test-session mechanism — never set in prod (env module asserts).
      DEMO_E2E_SECRET: "contract-suite-secret",
    },
  },
});
