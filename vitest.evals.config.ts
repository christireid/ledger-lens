import path from "node:path";
import { defineConfig } from "vitest/config";

// AI eval suite (§08.9) — golden cases against the seeded demo workspace.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    include: ["evals/**/*.eval.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
