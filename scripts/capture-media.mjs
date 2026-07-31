#!/usr/bin/env node
/**
 * README media capture — renders the seeded demo workspace and produces the
 * screenshots + GIFs under docs/media/. Runs against a production build
 * (`pnpm build` first). Not part of any verification gate — a documentation
 * tool (§25.4 kitchen-sink/README imagery).
 *
 * The GIFs are recorded continuously at ~6 fps with real elapsed timings, a
 * visible pointer that glides to whatever it clicks, and real per-character
 * typing — so they read as actual usage rather than a slideshow. Frames are
 * delta-encoded (unchanged pixels become transparent, disposal = leave in
 * place), which keeps a 10–15 s clip inside a few hundred KB.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import gifencPkg from "gifenc";
import pngjs from "pngjs";

const { GIFEncoder, quantize, applyPalette, prequantize } = gifencPkg;
const { PNG } = pngjs;

const PORT = 3222;
const BASE = `http://localhost:${PORT}`;
const SECRET = "e2e-secret";
const USER = `media_${Date.now()}`;
const OUT = "docs/media";
mkdirSync(OUT, { recursive: true });

// Must stay ≥1024 wide: below that the app shows its §05.11 "use a larger
// screen" interstitial, which is not what the README should demo.
const GIF_VIEW = { width: 1080, height: 675, dsf: 1 };
const FPS = 6;
const TYPE_DELAY = 55; // ms per character — human-paced typing

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

/**
 * Fake cursor — a real DOM node so screenshots can see it. It eases toward
 * each target before the click lands, which is what makes the GIFs read as
 * someone using the product.
 */
const CURSOR_INIT = `
  (() => {
    const mount = () => {
      if (document.getElementById("__gifcursor")) return;
      const c = document.createElement("div");
      c.id = "__gifcursor";
      c.style.cssText = [
        "position:fixed","left:0","top:0","width:20px","height:20px",
        "z-index:2147483647","pointer-events:none","will-change:transform",
        "transition:transform 500ms cubic-bezier(.33,.9,.36,1)",
        "transform:translate(80px,520px)",
        "filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))",
      ].join(";");
      c.innerHTML =
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none">' +
        '<path d="M5 2.5 L5 18.5 L9.2 14.6 L11.9 20.8 L14.6 19.6 L12 13.6 L18 13.2 Z"' +
        ' fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
      document.body.appendChild(c);
    };
    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount);
    // Next.js client navigation swaps the tree — keep the cursor mounted.
    setInterval(mount, 400);
  })();
`;

async function moveCursor(page, locator, { settle = 560 } = {}) {
  try {
    const box = await locator.boundingBox();
    if (!box) return;
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);
    await page.evaluate(([px, py]) => {
      const c = document.getElementById("__gifcursor");
      if (c) c.style.transform = `translate(${px}px, ${py}px)`;
    }, [x, y]);
    await sleep(settle);
  } catch { /* element vanished mid-flight */ }
}

/** Glide, pause, then click — the pause is what sells the intent. */
async function click(page, locator, { after = 0 } = {}) {
  await moveCursor(page, locator);
  await locator.click();
  if (after) await sleep(after);
}

/** Glide to a field, click it, then type character by character. */
async function type(page, locator, text, { after = 0 } = {}) {
  await moveCursor(page, locator);
  await locator.click();
  await sleep(180);
  await locator.pressSequentially(text, { delay: TYPE_DELAY });
  if (after) await sleep(after);
}

/**
 * Continuous recorder — screenshots on a fixed cadence, stamping each frame
 * with its true elapsed time so playback runs at real speed.
 */
function record(page) {
  const frames = [];
  let stopped = false;
  const pump = (async () => {
    let last = Date.now();
    while (!stopped) {
      const tick = Date.now();
      try {
        const buffer = await page.screenshot({ animations: "allow", caret: "initial" });
        const now = Date.now();
        frames.push({ buffer, delay: Math.max(60, now - last) });
        last = now;
      } catch { /* mid-navigation — skip this tick */ }
      await sleep(Math.max(0, 1000 / FPS - (Date.now() - tick)));
    }
  })();
  return {
    async stop(endHold = 1800) {
      stopped = true;
      await pump;
      if (frames.length) frames[frames.length - 1].delay = endHold;
      return frames;
    },
  };
}

async function newPage(browser, { dark = true, width = 1440, height = 900, dsf = 1.5, cursor = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dsf,
    colorScheme: dark ? "dark" : "light",
    baseURL: BASE,
  });
  await context.addCookies([
    { name: "demo_e2e_session", value: encodeURIComponent(`${SECRET}:${USER}`), url: BASE },
  ]);
  if (cursor) await context.addInitScript(CURSOR_INIT);
  return { context, page: await context.newPage() };
}

/** A GIF page: recording viewport, visible cursor, seeded session. */
const gifPage = (browser, opts = {}) => newPage(browser, { ...GIF_VIEW, cursor: true, ...opts });

async function settle(page, extra = 1000) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await sleep(extra);
}

const MAX_COLORS = 160;
// Diffing happens against the colours the viewer is ACTUALLY shown (palette
// output), not the source pixels — so quantisation error is corrected on the
// next frame instead of accumulating into ghosts of dismissed UI. With that
// feedback loop in place a small tolerance is safe and keeps files lean.
const DIFF_TOLERANCE = 5;

/**
 * Composite an emitted frame into the model of what the viewer now sees:
 * palette colours for painted pixels, previous contents where transparent.
 */
function paint(rendered, indexed, palette, transparentIndex) {
  for (let p = 0; p < indexed.length; p++) {
    const idx = indexed[p];
    if (idx === transparentIndex) continue;
    const color = palette[idx];
    const i = p * 4;
    rendered[i] = color[0];
    rendered[i + 1] = color[1];
    rendered[i + 2] = color[2];
    rendered[i + 3] = 255;
  }
}

/** True when two RGBA buffers differ beyond the shimmer tolerance. */
function differs(a, b) {
  for (let i = 0; i < a.length; i += 4) {
    if (
      Math.abs(a[i] - b[i]) > DIFF_TOLERANCE ||
      Math.abs(a[i + 1] - b[i + 1]) > DIFF_TOLERANCE ||
      Math.abs(a[i + 2] - b[i + 2]) > DIFF_TOLERANCE
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Delta GIF writer: frame 0 is full, later frames mark unchanged pixels
 * transparent and rely on disposal=1 (leave in place). Identical consecutive
 * frames are merged into a single longer-delay frame.
 */
function writeGif(file, rawFrames) {
  const decoded = rawFrames.map(({ buffer, delay }) => {
    const png = PNG.sync.read(buffer);
    prequantize(png.data, { roundRGB: 4 }); // de-noises AA shimmer
    return { data: png.data, width: png.width, height: png.height, delay };
  });
  if (decoded.length === 0) throw new Error(`no frames captured for ${file}`);

  const { width, height } = decoded[0];

  // Merge runs of visually identical frames — a still moment becomes one
  // long-delay frame instead of six near-duplicates.
  const merged = [];
  for (const frame of decoded) {
    const prev = merged[merged.length - 1];
    if (prev && !differs(prev.data, frame.data)) {
      prev.delay += frame.delay;
      continue;
    }
    merged.push(frame);
  }

  const gif = GIFEncoder();
  // `rendered` tracks what a viewer actually has on screen (frames composite
  // under disposal=1). Diffing against it — not against the source frame —
  // stops per-frame tolerance from accumulating into ghosting.
  let rendered = null;
  let emitted = 0;

  for (const frame of merged) {
    if (!rendered) {
      const palette = quantize(frame.data, MAX_COLORS, { format: "rgb565" });
      const indexed = applyPalette(frame.data, palette, "rgb565");
      gif.writeFrame(indexed, width, height, { palette, delay: frame.delay, dispose: 1 });
      rendered = new Uint8Array(frame.data.length);
      paint(rendered, indexed, palette, null);
      emitted += 1;
      continue;
    }

    // Mask unchanged pixels to alpha 0 so LZW collapses them to a few runs.
    const masked = new Uint8Array(frame.data.length);
    for (let i = 0; i < frame.data.length; i += 4) {
      const dr = Math.abs(frame.data[i] - rendered[i]);
      const dg = Math.abs(frame.data[i + 1] - rendered[i + 1]);
      const db = Math.abs(frame.data[i + 2] - rendered[i + 2]);
      if (dr > DIFF_TOLERANCE || dg > DIFF_TOLERANCE || db > DIFF_TOLERANCE) {
        masked[i] = frame.data[i];
        masked[i + 1] = frame.data[i + 1];
        masked[i + 2] = frame.data[i + 2];
        masked[i + 3] = 255;
      } // else leaves RGBA 0,0,0,0 → transparent, prior pixel stays on screen
    }

    // Index 0 is RESERVED for transparency. Letting the quantizer decide is a
    // trap: on a colour-rich frame it spends every slot on real colours, the
    // masked pixels then map to opaque black, and the whole canvas blanks out
    // for the rest of the clip.
    const palette = [
      [0, 0, 0, 0],
      ...quantize(masked, MAX_COLORS - 1, { format: "rgba4444" }).filter((c) => c[3] !== 0),
    ];
    const indexed = applyPalette(masked, palette, "rgba4444");
    gif.writeFrame(indexed, width, height, {
      palette,
      delay: frame.delay,
      dispose: 1,
      transparent: true,
      transparentIndex: 0,
    });
    paint(rendered, indexed, palette, 0); // keep the model of the screen exact
    emitted += 1;
  }

  gif.finish();
  writeFileSync(file, Buffer.from(gif.bytes()));
  const kb = Math.round(Buffer.from(gif.bytes()).length / 1024);
  console.log(`wrote ${file} (${emitted}/${decoded.length} frames, ${kb}KB)`);
}

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`wrote ${OUT}/${name}.png`);
};

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

  // ---- GIF 1: dashboard tour → evidence drawer ------------------------------
  {
    const { context, page } = await gifPage(browser);
    await page.goto("/app/dashboard");
    await settle(page, 1200);
    const rec = record(page);
    await sleep(900);
    await click(page, page.getByRole("tab", { name: "1y" }), { after: 1200 });
    await click(page, page.getByRole("tab", { name: "all" }), { after: 1300 });
    // Stat card → the evidence drawer behind the headline number
    await click(page, page.getByText("Total value").first(), { after: 1500 });
    await page.keyboard.press("Escape");
    await sleep(900);
    writeGif(`${OUT}/tour.gif`, await rec.stop());
    await context.close();
  }

  // ---- GIF 2: AI investigation streaming ------------------------------------
  {
    const { context, page } = await gifPage(browser);
    await page.goto("/app/investigations");
    await settle(page, 900);
    const rec = record(page);
    await sleep(700);
    await click(page, page.getByTestId("new-investigation"));
    await page.waitForURL(/\/app\/investigations\/inv_/, { timeout: 20_000 });
    await sleep(700);
    await type(page, page.getByTestId("composer"), "Why did my fees spike recently?", { after: 400 });
    await click(page, page.getByTestId("send-button"));
    await page.getByTestId("citation-chip").first().waitFor({ timeout: 30_000 }).catch(() => {});
    await sleep(1400);
    await click(page, page.getByTestId("citation-chip").first(), { after: 1800 });
    writeGif(`${OUT}/investigate.gif`, await rec.stop());
    await context.close();
  }

  // ---- GIF 3: full import wizard --------------------------------------------
  {
    const { context, page } = await gifPage(browser);
    await page.goto("/app/imports/new");
    await settle(page, 900);
    const rec = record(page);
    await sleep(800);
    await page.getByTestId("file-input").setInputFiles({
      name: "brokerage-export.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(SAMPLE_CSV),
    });
    await page.getByTestId("map-next").waitFor();
    await sleep(1400); // auto-mapped columns land
    await click(page, page.getByTestId("map-next"));
    await page.getByTestId("accepted-count").waitFor();
    await sleep(1600); // dry-run: accepted / rejected with reasons
    await click(page, page.getByTestId("preview-next"), { after: 600 });
    await click(page, page.getByTestId("account-select"), { after: 500 });
    await click(page, page.getByRole("option").first(), { after: 500 });
    await click(page, page.getByTestId("commit-button"));
    await page.waitForURL(/\/app\/imports\/batch_/, { timeout: 30_000 });
    await settle(page, 1400);
    writeGif(`${OUT}/import.gif`, await rec.stop());
    await context.close();
  }

  // ---- GIF 4: anomaly triage with undo --------------------------------------
  {
    const { context, page } = await gifPage(browser);
    await page.goto("/app/anomalies");
    await settle(page, 1100);
    const rec = record(page);
    await sleep(900);
    await click(page, page.getByRole("button", { name: "Acknowledge", exact: true }).first(), {
      after: 1600, // card animates out, undo toast arms
    });
    await click(page, page.getByRole("button", { name: "Undo" }), { after: 1800 });
    writeGif(`${OUT}/triage.gif`, await rec.stop());
    await context.close();
  }

  // ---- GIF 5: ledger search, filter, drill-in --------------------------------
  {
    const { context, page } = await gifPage(browser);
    await page.goto("/app/ledger");
    await settle(page, 1100);
    const rec = record(page);
    await sleep(700);
    const search = page.getByPlaceholder("Search descriptions…");
    await type(page, search, "netflix", { after: 1600 }); // results narrow live
    await search.fill("");
    await sleep(900);
    await click(page, page.getByLabel("Filter by type"), { after: 500 });
    await click(page, page.getByRole("option", { name: "fee" }), { after: 1500 });
    await click(page, page.getByTestId("ledger-table").locator("tbody tr").first(), {
      after: 1700, // row expansion reveals provenance
    });
    writeGif(`${OUT}/search.gif`, await rec.stop());
    await context.close();
  }

  // ---- GIF 6: command palette + theme toggle --------------------------------
  {
    const { context, page } = await gifPage(browser);
    await page.goto("/app/dashboard");
    await settle(page, 1100);
    const rec = record(page);
    await sleep(800);
    await page.keyboard.press("ControlOrMeta+k");
    await sleep(900); // palette opens with its groups
    await page.keyboard.type("ledger", { delay: TYPE_DELAY });
    await sleep(900);
    await page.keyboard.press("Enter");
    await settle(page, 1300);
    await page.keyboard.press("ControlOrMeta+k");
    await sleep(700);
    await page.keyboard.type("theme", { delay: TYPE_DELAY });
    await sleep(800);
    await page.keyboard.press("Enter"); // dark → light, in place
    await sleep(1800);
    writeGif(`${OUT}/palette.gif`, await rec.stop());
    await context.close();
  }

  await browser.close();
  console.log("media capture complete");
} finally {
  server.kill("SIGTERM");
}
