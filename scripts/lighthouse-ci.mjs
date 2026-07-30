#!/usr/bin/env node
/**
 * Lighthouse CI runner — §20.8. Starts the production build, mints a seeded
 * demo test-session (§20.8 test-only auth, guarded by DEMO_E2E_SECRET), then
 * runs `lhci` for /, /app/dashboard, /app/ledger with the assertions in
 * lighthouserc.json (LCP < 2500, CLS < 0.02, TBT < 300, performance ≥ 90;
 * 3 runs, desktop preset @1280px, median).
 *
 * Against a Vercel preview deploy, set LHCI_BASE_URL instead and no local
 * server is started.
 */
import { spawn, execSync } from "node:child_process";

const secret = process.env.DEMO_E2E_SECRET ?? "ci-e2e-secret";
const userId = `lhci_${Date.now()}`;
const external = process.env.LHCI_BASE_URL;
const base = external ?? "http://localhost:3111";

let server = null;
if (!external) {
  server = spawn("pnpm", ["exec", "next", "start", "-p", "3111"], {
    stdio: "inherit",
    env: { ...process.env, DEMO_E2E_SECRET: secret },
  });
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.status === 200 || res.status === 503) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("server never became healthy");
}

try {
  await waitForServer();

  // Seed a demo workspace for the authenticated pages (§20.8).
  const seed = await fetch(`${base}/api/workspace/demo`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-demo-e2e-secret": secret,
      "x-demo-user-id": userId,
    },
    body: JSON.stringify({ action: "seed" }),
  });
  if (!seed.ok) throw new Error(`demo seed failed: ${seed.status}`);

  const cookie = `demo_e2e_session=${secret}:${userId}`;
  const urls = ["/", "/app/dashboard", "/app/ledger"].map((p) => `${base}${p}`);

  const args = [
    "dlx",
    "@lhci/cli@0.14.x",
    "autorun",
    ...urls.map((u) => `--collect.url=${u}`),
    `--collect.settings.extraHeaders=${JSON.stringify({ Cookie: cookie })}`,
    `--collect.settings.chromeFlags=--headless=new --no-sandbox --disable-dev-shm-usage`,
    "--upload.target=filesystem",
    "--upload.outputDir=.lighthouseci",
  ];
  execSync(`pnpm ${args.map((a) => JSON.stringify(a)).join(" ")}`, {
    stdio: "inherit",
    env: { ...process.env },
  });
  console.log("lighthouse ok — all §20.8 assertions passed");
} finally {
  server?.kill("SIGTERM");
}
