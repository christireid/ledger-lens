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

const GIF_VIEW = { width: 1080, height: 675 };
const HOLD = 1300; // ms shown for a settled state
const STEP = 450; // ms shown for a transition state

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

async function settle(page, extra = 1200) {
  await page.waitForLoadState("networkidle");
  await sleep(extra);
}

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

/** Frame recorder bound to one page. */
function recorder(page) {
  const frames = [];
  return {
    frames,
    frame: async (delay = STEP) => frames.push({ buffer: await page.screenshot(), delay }),
  };
}

const SAMPLE_CSV = [
  "Date,Description,Amount,Type,Symbol,Quantity,Price",
  "2026-06-02,ACME PAYROLL,2500.00,deposit,,,",
  "2026-06-03,YOU BOUGHT AAPL,-1850.50,bought,AAPL,10,185.05",
  "2026-06-10,STREAMFLIX MONTHLY,-15.99,debit,,,",
  "2026-06-15,BROKER FEE,-4.95,fee,,,",
  "not-a-date,BAD ROW,-10.00,debit,,,",
].join("\r\n");

try {
  await waitUp();
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
    await settle(page, 700);
    await shot(page, "marketing-light");
    await context.close();
  }
  {
    const { context, page } = await newPage(browser);
    await page.goto("/");
    await settle(page, 700);
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

    await page.goto("/app/investigations");
    await page.getByTestId("new-investigation").click();
    await page.waitForURL(/\/app\/investigations\/inv_/, { timeout: 20_000 });
    await page.getByTestId("composer").fill("What were my largest fees this quarter?");
    await page.getByTestId("send-button").click();
    await page.getByTestId("citation-chip").first().waitFor({ timeout: 30_000 });
    await sleep(900);
    await shot(page, "investigation");

    await page.goto("/app/imports/new");
    await page.getByTestId("file-input").setInputFiles({
      name: "brokerage-export.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(SAMPLE_CSV),
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

  // ---- GIF 1: product tour -------------------------------------------------
  {
    const { context, page } = await newPage(browser, { ...GIF_VIEW, dsf: 1 });
    const { frames, frame } = recorder(page);
    await page.goto("/app/dashboard");
    await settle(page);
    await frame(HOLD);
    for (const range of ["1y", "all"]) {
      await page.getByRole("tab", { name: range }).click();
      await sleep(1000);
      await frame(900);
    }
    await page.goto("/app/anomalies");
    await settle(page);
    await frame(HOLD);
    await page.getByTestId("evidence-chip").first().click();
    await sleep(600);
    await frame(STEP);
    await sleep(700);
    await frame(HOLD + 400);
    writeGif(`${OUT}/tour.gif`, frames);
    await context.close();
  }

  // ---- GIF 2: AI investigation streaming ------------------------------------
  {
    const { context, page } = await newPage(browser, { ...GIF_VIEW, dsf: 1 });
    const { frames, frame } = recorder(page);
    await page.goto("/app/investigations");
    await settle(page, 700);
    await page.getByTestId("new-investigation").click();
    await page.waitForURL(/\/app\/investigations\/inv_/, { timeout: 20_000 });
    await sleep(600);
    await frame(700);
    await page.getByTestId("composer").fill("Why did my fees spike recently?");
    await frame(600);
    await page.getByTestId("send-button").click();
    for (let i = 0; i < 12; i++) {
      await sleep(380);
      await frame(120);
    }
    await sleep(1000);
    await frame(HOLD + 500);
    writeGif(`${OUT}/investigate.gif`, frames);
    await context.close();
  }

  // ---- GIF 3: full import wizard --------------------------------------------
  {
    const { context, page } = await newPage(browser, { ...GIF_VIEW, dsf: 1 });
    const { frames, frame } = recorder(page);
    await page.goto("/app/imports/new");
    await settle(page, 600);
    await frame(HOLD);
    await page.getByTestId("file-input").setInputFiles({
      name: "brokerage-export.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(SAMPLE_CSV),
    });
    await page.getByTestId("map-next").waitFor();
    await sleep(700);
    await frame(HOLD); // auto-mapped columns
    await page.getByTestId("map-next").click();
    await page.getByTestId("accepted-count").waitFor();
    await sleep(500);
    await frame(HOLD); // dry-run: accepted/rejected + reasons
    await page.getByTestId("preview-next").click();
    await sleep(500);
    await frame(STEP);
    await page.getByTestId("account-select").click();
    await sleep(400);
    await frame(STEP); // account dropdown open
    await page.getByRole("option").first().click();
    await frame(STEP);
    await page.getByTestId("commit-button").click();
    await page.waitForURL(/\/app\/imports\/batch_/, { timeout: 30_000 });
    await settle(page, 700);
    await frame(HOLD + 500); // batch detail with stats
    writeGif(`${OUT}/import.gif`, frames);
    await context.close();
  }

  // ---- GIF 4: anomaly triage with undo --------------------------------------
  {
    const { context, page } = await newPage(browser, { ...GIF_VIEW, dsf: 1 });
    const { frames, frame } = recorder(page);
    await page.goto("/app/anomalies");
    await settle(page);
    await frame(HOLD);
    await page.getByRole("button", { name: "Acknowledge", exact: true }).first().click();
    await sleep(350);
    await frame(STEP); // card animating out + undo toast
    await sleep(600);
    await frame(900);
    await page.getByRole("button", { name: "Undo" }).click();
    await sleep(800);
    await frame(HOLD + 400); // card restored
    writeGif(`${OUT}/triage.gif`, frames);
    await context.close();
  }

  // ---- GIF 5: ledger search & filters ---------------------------------------
  {
    const { context, page } = await newPage(browser, { ...GIF_VIEW, dsf: 1 });
    const { frames, frame } = recorder(page);
    await page.goto("/app/ledger");
    await settle(page);
    await frame(HOLD);
    const search = page.getByPlaceholder("Search descriptions…");
    for (const term of ["net", "netflix"]) {
      await search.fill(term);
      await sleep(900);
      await frame(900);
    }
    await search.fill("");
    await page.getByLabel("Filter by type").click();
    await sleep(400);
    await frame(STEP);
    await page.getByRole("option", { name: "fee" }).click();
    await sleep(900);
    await frame(HOLD); // fee rows + chip
    const row = page.getByTestId("ledger-table").locator("tbody tr").first();
    await row.click();
    await sleep(600);
    await frame(HOLD + 400); // expanded provenance row
    writeGif(`${OUT}/search.gif`, frames);
    await context.close();
  }

  // ---- GIF 6: command palette + theme toggle --------------------------------
  {
    const { context, page } = await newPage(browser, { ...GIF_VIEW, dsf: 1 });
    const { frames, frame } = recorder(page);
    await page.goto("/app/dashboard");
    await settle(page);
    await frame(900);
    await page.keyboard.press("ControlOrMeta+k");
    await sleep(500);
    await frame(HOLD); // palette open with groups
    await page.keyboard.type("toggle");
    await sleep(400);
    await frame(900);
    await page.keyboard.press("Enter"); // theme toggle
    await sleep(900);
    await frame(HOLD); // light theme
    await page.keyboard.press("ControlOrMeta+k");
    await page.keyboard.type("anom");
    await sleep(400);
    await frame(900);
    await page.keyboard.press("Enter");
    await settle(page, 800);
    await frame(HOLD + 400); // anomalies in light theme
    writeGif(`${OUT}/palette.gif`, frames);
    await context.close();
  }

  await browser.close();
  console.log("media capture complete");
} finally {
  server.kill("SIGTERM");
}
