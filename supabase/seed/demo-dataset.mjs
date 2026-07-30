/**
 * Demo seed dataset — §15.7 (F13, normative content). Deterministic generator:
 * fixed RNG seed + fixed seed date → byte-stable output (§23.10-5). One
 * dataset, four consumers (12/13/14 tests, 08.9 evals, S-10 demo path),
 * version-stamped so eval baselines invalidate when it changes.
 *
 * Planted findings (each detector must fire):
 *  D1 duplicated $89.99 charge pair 2 days apart
 *  D2 brokerage fee jump ~$4.95 → $39.95×3 in one month
 *  D3 a $18,500 wire
 *  D4 equity allocation walks 78% → 89% over the last quarter
 *  D5 one oversold position from a pre-history sell (§12.4)
 *  D6 checking account silent for 60 days
 */

export const DEMO_DATASET_VERSION = "1.1.0";
export const DEMO_SEED_DATE = "2026-07-01"; // fixed — never now()

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fmt = (n) => n.toFixed(2);

function* monthsBack(endDate, count) {
  const [y, m] = endDate.split("-").map(Number);
  for (let i = count - 1; i >= 0; i--) {
    const total = y * 12 + (m - 1) - i;
    yield { year: Math.floor(total / 12), month: (total % 12) + 1 };
  }
}

const day = (y, m, d) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function generateDemoDataset() {
  const rand = mulberry32(0x1edbe125);

  const accounts = [
    { key: "brokerage", name: "Fidelity Brokerage", type: "brokerage", institution: "Fidelity", currency: "USD" },
    { key: "checking", name: "Chase Checking", type: "bank", institution: "Chase", currency: "USD" },
    { key: "card", name: "Amex Gold", type: "card", institution: "American Express", currency: "USD" },
  ];

  const instruments = [
    { symbol: "AAPL", kind: "equity", name: "Apple Inc.", start: 180 },
    { symbol: "MSFT", kind: "equity", name: "Microsoft Corp.", start: 410 },
    { symbol: "NVDA", kind: "equity", name: "NVIDIA Corp.", start: 120 },
    { symbol: "AMZN", kind: "equity", name: "Amazon.com Inc.", start: 175 },
    { symbol: "GOOG", kind: "equity", name: "Alphabet Inc.", start: 165 },
    { symbol: "META", kind: "equity", name: "Meta Platforms", start: 480 },
    { symbol: "VTI", kind: "etf", name: "Vanguard Total Stock Market", start: 260 },
    { symbol: "VXUS", kind: "etf", name: "Vanguard Total Intl Stock", start: 62 },
    { symbol: "BND", kind: "etf", name: "Vanguard Total Bond Market", start: 72 },
    { symbol: "VNQ", kind: "etf", name: "Vanguard Real Estate", start: 84 },
    { symbol: "SCHD", kind: "etf", name: "Schwab US Dividend Equity", start: 27 },
    { symbol: "TSLA", kind: "equity", name: "Tesla Inc.", start: 250 },
  ];

  // Realistic price walks: monthly random walk per instrument, deterministic.
  const priceAt = new Map(); // symbol -> [{ym, price}]
  for (const inst of instruments) {
    let price = inst.start;
    const walk = [];
    for (const { year, month } of monthsBack(DEMO_SEED_DATE, 24)) {
      price = Math.max(5, price * (1 + (rand() - 0.47) * 0.09));
      walk.push({ year, month, price });
    }
    priceAt.set(inst.symbol, walk);
  }
  const monthPrice = (symbol, year, month) => {
    const walk = priceAt.get(symbol);
    const hit = walk.find((w) => w.year === year && w.month === month);
    return hit ? hit.price : walk[walk.length - 1].price;
  };

  const txs = [];
  const push = (accountKey, date, type, amount, description, extra = {}) =>
    txs.push({ accountKey, date, type, amount, currency: "USD", description, ...extra });

  const months = [...monthsBack(DEMO_SEED_DATE, 24)];
  const lastMonth = months[months.length - 1];
  const silence60Start = "2026-05-02"; // D6: checking silent from here (60 days to seed date)

  const SUBSCRIPTIONS = [
    { desc: "NETFLIX.COM", amount: 15.49, day: 3 },
    { desc: "SPOTIFY USA", amount: 11.99, day: 7 },
    { desc: "AWS.AMAZON.COM", amount: 23.7, day: 11 },
    { desc: "NYTIMES DIGITAL", amount: 17.0, day: 15 },
    { desc: "PELOTON MEMBERSHIP", amount: 44.0, day: 19 },
  ];

  months.forEach(({ year, month }, mi) => {
    const isLastQuarter = mi >= months.length - 3;
    const monthEnd = (d) => day(year, month, d);

    // — Checking: salary, rent, groceries, transfers (D6: silent after 2026-05-01)
    const checkingActive = (d) => monthEnd(d) < silence60Start;
    if (checkingActive(1)) {
      push("checking", monthEnd(1), "deposit", fmt(8250), "ACME CORP PAYROLL");
    }
    if (checkingActive(2)) {
      push("checking", monthEnd(2), "withdrawal", fmt(-2400), "OAKWOOD APTS RENT");
    }
    if (checkingActive(15)) {
      push("checking", monthEnd(15), "deposit", fmt(8250), "ACME CORP PAYROLL");
    }
    for (let i = 0; i < 9; i++) {
      const d = 2 + Math.floor(rand() * 26);
      if (checkingActive(d)) {
        push("checking", monthEnd(d), "withdrawal", fmt(-(20 + rand() * 240)),
          ["WHOLE FOODS", "TRADER JOES", "SHELL OIL", "CVS PHARMACY", "COSTCO WHSE",
           "UBER TRIP", "COMCAST CABLE", "PG&E UTILITY", "VERIZON WIRELESS"][i]);
      }
    }
    if (checkingActive(20)) {
      push("checking", monthEnd(20), "transfer_out", fmt(-3000), "TRANSFER TO FIDELITY");
      push("brokerage", monthEnd(21), "transfer_in", fmt(3000), "EFT FROM CHASE");
    }

    // — Card: subscriptions + spend
    for (const sub of SUBSCRIPTIONS) {
      push("card", monthEnd(sub.day), "withdrawal", fmt(-sub.amount), sub.desc);
    }
    for (let i = 0; i < 28; i++) {
      const d = 1 + Math.floor(rand() * 28);
      push("card", monthEnd(d), "withdrawal", fmt(-(8 + rand() * 180)),
        ["DOORDASH", "AMAZON MKTPLACE", "TARGET", "STARBUCKS", "DELTA AIR", "AIRBNB",
         "HOME DEPOT", "APPLE.COM/BILL", "LYFT", "CHIPOTLE", "REI", "SEPHORA",
         "BEST BUY", "WALGREENS", "STARBUCKS", "BLUE BOTTLE", "SWEETGREEN", "MCDONALDS",
         "SHAKE SHACK", "UNITED AIR", "MARRIOTT", "EXXONMOBIL", "PETSMART", "IKEA",
         "NORDSTROM", "GRUBHUB", "INSTACART", "TICKETMASTER"][i]);
    }
    if (checkingActive(27)) {
      push("checking", monthEnd(27), "withdrawal", fmt(-(1800 + rand() * 900)), "AMEX EPAYMENT");
    } else {
      rand(); // keep the RNG stream stable regardless of the D6 silence window
    }

    // — Brokerage: monthly ETF buys + occasional equity trades + dividends
    const buyEtf = (symbol, budget, d) => {
      const price = monthPrice(symbol, year, month);
      const qty = Math.max(1, Math.floor(budget / price));
      push("brokerage", monthEnd(d), "buy", fmt(-(qty * price)),
        `YOU BOUGHT ${symbol}`, { symbol, quantity: String(qty), price: fmt(price) });
    };
    // D4 drift: last quarter shifts heavily into equities.
    if (isLastQuarter) {
      buyEtf("NVDA", 2600, 6);
      buyEtf("AAPL", 2000, 12);
      buyEtf("MSFT", 1800, 18);
      buyEtf("META", 1200, 24);
      // D4 finale: the walk steepens at the end so the drift exceeds the
      // trailing-90-day median even when evaluated retrospectively.
      if (mi === months.length - 1) {
        buyEtf("NVDA", 16000, 26);
        buyEtf("MSFT", 9000, 27);
      }
    } else {
      buyEtf("VTI", 1200, 6);
      buyEtf("VXUS", 700, 6);
      buyEtf("BND", 700, 12);
      if (mi % 3 === 0) buyEtf("SCHD", 400, 18);
      if (mi % 4 === 1) buyEtf("AAPL", 800, 15);
      if (mi % 5 === 2) buyEtf("VNQ", 400, 21);
    }
    if (mi % 6 === 3) {
      const price = monthPrice("GOOG", year, month);
      push("brokerage", monthEnd(9), "sell", fmt(3 * price), "YOU SOLD GOOG",
        { symbol: "GOOG", quantity: "3", price: fmt(price) });
    }
    // Buy GOOG earlier so those sells are covered.
    if (mi === 1) buyEtf("GOOG", 4000, 8);

    // Dividends quarterly on ETFs
    if (month % 3 === 0) {
      push("brokerage", monthEnd(25), "dividend", fmt(30 + rand() * 90), "VTI DIVIDEND", { symbol: "VTI" });
      push("brokerage", monthEnd(26), "dividend", fmt(15 + rand() * 40), "SCHD DIVIDEND", { symbol: "SCHD" });
    }
    push("brokerage", monthEnd(28), "interest", fmt(2 + rand() * 9), "FDIC INSURED DEPOSIT INTEREST");

    // D2: brokerage fee jump — baseline ~4.95, spike month (3 months ago): 39.95×3
    const spikeMonth = months[months.length - 4];
    if (year === spikeMonth.year && month === spikeMonth.month) {
      push("brokerage", monthEnd(5), "fee", fmt(-39.95), "WIRE TRANSFER FEE");
      push("brokerage", monthEnd(14), "fee", fmt(-39.95), "OUTGOING TRANSFER FEE");
      push("brokerage", monthEnd(22), "fee", fmt(-39.95), "SPECIAL HANDLING FEE");
    } else {
      push("brokerage", monthEnd(16), "fee", fmt(-4.95), "MONTHLY ACCOUNT FEE");
    }
  });

  // Initial funding
  push("checking", day(months[0].year, months[0].month, 1), "deposit", fmt(24000), "OPENING TRANSFER");
  push("brokerage", day(months[0].year, months[0].month, 2), "deposit", fmt(52000), "ACAT CASH TRANSFER IN");

  // D1: duplicated $89.99 charge pair, 2 days apart (recent — within last 45 days)
  push("card", "2026-06-04", "withdrawal", "-89.99", "FITLIFE GYM ANNUAL");
  push("card", "2026-06-06", "withdrawal", "-89.99", "FITLIFE GYM ANNUAL");

  // D3: a $18,500 wire out of checking (before the D6 silence window)
  push("checking", "2026-04-18", "withdrawal", "-18500.00", "WIRE OUT - COASTAL ESCROW LLC");

  // D5: oversold position — sell TSLA never bought here (pre-history sell)
  {
    const price = monthPrice("TSLA", lastMonth.year, lastMonth.month);
    push("brokerage", "2026-06-10", "sell", fmt(8 * price), "YOU SOLD TSLA",
      { symbol: "TSLA", quantity: "8", price: fmt(price) });
  }

  // Stable ordering: (date, insertion index) — createdAt assigned at insert time.
  txs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return {
    version: DEMO_DATASET_VERSION,
    seedDate: DEMO_SEED_DATE,
    accounts,
    instruments: instruments.map(({ symbol, kind, name }) => ({ symbol, kind, name, currency: "USD" })),
    transactions: txs,
  };
}

/**
 * §15.7: 6 rows engineered to reject, for the S-10 demo path and E2E suite —
 * bad dates, sign conflict, incomplete trade, unknown currency, zero amount.
 */
export function generateDemoImportCsv() {
  const { transactions } = generateDemoDataset();
  const sample = transactions.filter((t) => t.accountKey === "card").slice(0, 24);
  const lines = ["Date,Description,Amount,Type,Symbol,Quantity,Price,Currency"];
  for (const t of sample) {
    lines.push(
      [t.date, t.description, t.amount, t.type === "withdrawal" ? "DEBIT" : t.type,
       t.symbol ?? "", t.quantity ?? "", t.price ?? "", ""].join(","),
    );
  }
  // The 6 engineered rejects:
  lines.push("13/45/2026,BAD DATE ROW,-12.00,DEBIT,,,,");           // date_unparseable
  lines.push("1985-03-02,TOO OLD ROW,-12.00,DEBIT,,,,");            // date_out_of_range
  lines.push("2026-06-01,UNPARSEABLE AMOUNT,twelve,DEBIT,,,,");     // amount_unparseable
  lines.push("2026-06-02,ZERO AMOUNT,0.00,DEBIT,,,,");              // amount_zero
  lines.push("2026-06-03,SIGN CONFLICT BUY,250.00,BOUGHT,VTI,1,150.00,"); // sign_conflict
  lines.push("2026-06-04,INCOMPLETE TRADE,-100.00,BOUGHT,AAPL,,,"); // incomplete_trade
  return lines.join("\r\n") + "\r\n";
}
