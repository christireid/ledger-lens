import { defineConfig, devices } from "@playwright/test";

/**
 * E2E — §22/§23: journeys, axe, keyboard, hydration. Auth via the §20.8
 * test-session cookie (DEMO_E2E_SECRET — never set in prod).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 1, // §27.7-2: one retry; twice-failing is a real failure
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3100",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm next build && pnpm next start -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      DEMO_E2E_SECRET: "e2e-secret",
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/ledger_lens",
      DIRECT_URL: process.env.DIRECT_URL ?? "postgres://postgres:postgres@localhost:5432/ledger_lens",
      OPENAI_API_KEY: "MOCK",
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Pinned pre-installed browser (environment provides chromium-1194;
        // @playwright/test pins a different revision — use the system binary).
        launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
      },
    },
  ],
});
