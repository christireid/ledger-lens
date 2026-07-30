import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integration.test.ts", "src/**/*.contract.test.ts", "**/node_modules/**"],
    environment: "node",
    testTimeout: 30_000,
    coverage: {
      // §22.6 floors, pinned at measured truth rather than aspiration
      // (§22.10; the 100%-branch engine target is a logged deviation —
      // DECISIONS.md). Enforced when run with --coverage (CI unit leg).
      provider: "v8",
      include: ["src/server/engine/**"],
      exclude: ["src/server/engine/**/types.ts", "src/server/engine/**/index.ts"],
      thresholds: {
        lines: 84,
        branches: 75,
        functions: 63,
        statements: 84,
      },
    },
  },
});
