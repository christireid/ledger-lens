#!/usr/bin/env node
/**
 * README media capture — renders the seeded demo workspace and produces the
 * screenshots + GIFs under docs/media/. Runs against a production build
 * (`pnpm build` first). Not part of any verification gate — a documentation
 * tool (§25.4 kitchen-sink/README imagery).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import gifencPkg from "gifenc";
import pngjs from "pngjs";

const { GIFEncoder, quantize, applyPalette } = gifencPkg;
const { PNG } = pngjs;

const PORT = 3222;
const BASE = `http://localhost:${PORT}`;
const SECRET = "e2e-secret";
const USER = `media_${Date.now()}`;
const OUT = "docs/media";
mkdirSync(OUT, { recursive: true });

const server = spawn("pnpm", ["exec", "next", "start", "-p", String(PORT)], {
  stdio: "ignore",
  env: {
    ...process.env,
    DEMO_E2E_SECRET: SECRET,
    DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/ledger_lens",
    DIRECT_URL: process.env.DIRECT_URL ?? "postgres://postgres:postgres@localhost:5432/ledger_lens",
    OPENAI_API_KEY: "MOCK",
  },
});

async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("server never came up");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage(browser, { dark = true, width = 1440, height = 900, dsf = 1.5 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dsf,
    colorScheme: dark ? "dark" : "light",
    baseURL: BASE,
  });
  await context.addCookies([
    { name: "demo_e2e_session", value: encodeURIComponent(`${SECRET}:${USER}`), url: BASE },
  ]);
  return { context, page: await context.newPage() };
}

async function settle(page, extra = 1400) {
  await page.waitForLoadState("networkidle");
  await sleep(extra); // chart/motion settle
}

/** GIF assembly — per-frame palettes via gifenc. */
function writeGif(file, frames) {
  const gif = GIFEncoder();
  for (const { buffer, delay } of frames) {
    const png = PNG.sync.read(buffer);
    const palette = quantize(png.data, 256);
    const index = applyPalette(png.data, palette);
    gif.writeFrame(index, png.width, png.height, { palette, delay });
  }
  gif.finish();
  writeFileSync(file, Buffer.from(gif.bytes()));
  console.log(`wrote ${file} (${frames.length} frames)`);
}

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`wrote ${OUT}/${name}.png`);
};

try {
  await waitUp();
  // Seed the demo workspace (deterministic dataset, planted findings — §15.7).
  const seed = await fetch(`${BASE}/api/workspace/demo`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-demo-e2e-secret": SECRET,
      "x-demo-user-id": USER,
    },
    body: JSON.stringify({ action: "seed" }),
  });
  if (!seed.ok) throw new Error(`seed failed ${seed.status}`);

  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    args: ["--no-sandbox"],
  });

  // ---- static screenshots -------------------------------------------------
  {
    const { context, page } = await newPage(browser, { dark: false });
    await page.goto("/");
    await settle(page, 800);
    await shot(page, "marketing-light");
    await context.close();
  }
  {
    const { context, page } = await newPage(browser);
    await page.goto("/");
    await settle(page, 800);
    await shot(page, "marketing-dark");

    await page.goto("/app/dashboard");
    await settle(page);
    await shot(page, "dashboard");

    await page.goto("/app/ledger");
    await settle(page);
    await shot(page, "ledger");

    await page.goto("/app/anomalies");
    await settle(page);
    await shot(page, "anomalies");

    // AI investigation with the deterministic mock transport (§08).
    await page.goto("/app/investigations");
    await page.getByTestId("new-investigation").click();
    await page.waitForURL(/\/app\/investigations\/inv_/, { timeout: 20_000 });
    await page.getByTestId("composer").fill("What were my largest fees this quarter?");
    await page.getByTestId("send-button").click();
    await page.getByTestId("citation-chip").first().waitFor({ timeout: 30_000 });
    await sleep(900);
    await shot(page, "investigation");

    // Import wizard at the dry-run preview step.
    await page.goto("/app/imports/new");
    await page.getByTestId("file-input").setInputFiles({
      name: "brokerage-export.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        [
          "Date,Description,Amount,Type,Symbol,Quantity,Price",
          "2026-06-02,ACME PAYROLL,2500.00,deposit,,,",
          "2026-06-03,YOU BOUGHT AAPL,-1850.50,bought,AAPL,10,185.05",
          "2026-06-10,STREAMFLIX MONTHLY,-15.99,debit,,,",
          "2026-06-15,BROKER FEE,-4.95,fee,,,",
          "not-a-date,BAD ROW,-10.00,debit,,,",
        ].join("\r\n"),
      ),
    });
    await settle(page, 900);
    await shot(page, "import-mapping");
    await context.close();
  }
  {
    const { context, page } = await newPage(browser, { dark: false });
    await page.goto("/dev/kitchen-sink");
    await settle(page, 700);
    await shot(page, "kitchen-sink");
    await context.close();
  }

  // ---- GIF: product tour --------------------------------------------------
  {
    const { context, page } = await newPage(browser, { width: 1080, height: 675, dsf: 1 });
    const frames = [];
    const frame = async (delay = 130) =>
      frames.push({ buffer: await page.screenshot(), delay });

    await page.goto("/app/dashboard");
    await settle(page);
    await frame(200);
    await page.getByTestId("tab-1y").isVisible().catch(() => false); // range tabs have no testid — click by text
    await page.getByRole("tab", { name: "1y" }).click();
    await sleep(1200);
    await frame(180);
    await page.goto("/app/anomalies");
    await settle(page);
    await frame(200);
    await page.getByTestId("evidence-chip").first().click();
    await sleep(1200);
    await frame(250);
    writeGif(`${OUT}/tour.gif`, frames);
    await context.close();
  }

  // ---- GIF: AI investigation streaming ------------------------------------
  {
    const { context, page } = await newPage(browser, { width: 1080, height: 675, dsf: 1 });
    const frames = [];
    const frame = async (delay = 130) =>
      frames.push({ buffer: await page.screenshot(), delay });

    await page.goto("/app/investigations");
    await settle(page, 800);
    await page.getByTestId("new-investigation").click();
    await page.waitForURL(/\/app\/investigations\/inv_/, { timeout: 20_000 });
    await sleep(600);
    await frame(160);
    await page.getByTestId("composer").fill("Why did my fees spike recently?");
    await frame(120);
    await page.getByTestId("send-button").click();
    for (let i = 0; i < 10; i++) {
      await sleep(450);
      await frame(60);
    }
    await sleep(1200);
    await frame(300);
    writeGif(`${OUT}/investigate.gif`, frames);
    await context.close();
  }

  await browser.close();
  console.log("media capture complete");
} finally {
  server.kill("SIGTERM");
}
