# PROGRESS.md — Ledger Lens Build State

> Maintained by the builder agent per spec §27 (Autonomous Build Protocol).
> This file + DECISIONS.md + git history are the complete resumable state.
> Loop: ORIENT → READ → BUILD → VERIFY → RECORD → LOOP. Gates are strict and
> cumulative: `pnpm verify:all` must stay green before every milestone transition.

## Operator config status (27.3 bootstrap inputs)

| Input | Status |
| --- | --- |
| Git repository | ✅ `christireid/ledger-lens`, branch `claude/document-access-request-zkx8dg` |
| Clerk keys (dev) | ❌ not provided — HALT item for M2 live-auth wiring; keyless/mocked paths proceed |
| Supabase | ❌ no hosted project — local Postgres via docker (spec allows `supabase start` locally) |
| OpenAI API key | ❌ not provided — treated as `MOCK` per operator config; AI runs against mocked gateway (§22) |
| Upstash Redis | ⬜ optional until M5; rate limits fail-open per §07.7 |
| Vercel project | ⬜ optional until M9 — deferred |

## Milestone graph (27.4)

Dependencies strict: M0 → M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M9.

---

### M0 — Scaffold & rails
Spec inputs: 06.2–3, 06.12, 07.9, 23. Verify: `pnpm typecheck && pnpm lint && pnpm build`.

- [x] Next app scaffold (App Router, strict TS + noUncheckedIndexedAccess + exactOptionalPropertyTypes, @/* alias, all code under src/)
- [x] Tailwind + design tokens (04.3 globals.css — full §04.3.1/04.3.2 tables, radius family, focus-ring rule; Inter + JetBrains Mono via next/font)
- [x] Lint rules incl. architecture greps (eslint flat config: alias-only imports, lucide registry rule; scripts/arch-grep.sh: hex colors, arbitrary Tailwind values, inline style, @apply, raw query keys, server-import-in-client)
- [x] server/env.ts (Zod-validated per 23.4; prod-required set enforced, DEMO_E2E_SECRET asserted absent in prod; openAiIsMocked helper) + lib/env.client.ts + lib/flags.ts (F10–F14 dark)
- [x] pnpm scripts incl. `verify:all` (full §23.3 inventory; unimplemented db/size/explain scripts fail loudly until their milestone)
- [x] Verify gate green — `pnpm typecheck && pnpm lint && pnpm build` and `pnpm verify:all` pass (2026-07-30)

### M1 — Schema & data layer
Spec inputs: 09 (all), 16, 07.3. Verify: `pnpm db:migrate && pnpm test:unit` (marshal round-trip, enum parity, DDL snapshot).

- [x] Drizzle schema + migrations (all 13 tables per §09.3 incl. checks, §09.5 indexes; 0000 generated + 0001 custom: extensions, supersedes FK, updated_at triggers, expression uniques, auth.jwt() stub, app_user role + column-level grants)
- [x] RLS policies (all workspace-scoped tables + instruments read/insert-all; verified manually via psql two-user probe: cross-tenant reads return zero rows; UPDATE amount denied, UPDATE superseded allowed)
- [x] Marshal layer (server/db/marshal.ts — only numeric-string ↔ bigint boundary; wire emits decimal strings)
- [x] Enum-parity test (TS §16 sets == drizzle pgEnums == migration SQL CREATE TYPEs) + DDL drift gate + §02.4 concept-name checklist + money/qty property tests
- [x] Seed runner shell (supabase/seed/run.mjs frame; deterministic generator lands in M4 per §27.4, fails loudly until then)
- [x] Verify gate green — `pnpm db:migrate && pnpm test:unit` (13 tests) + cumulative `pnpm verify:all` (2026-07-30; local Postgres 16 with unaccent/btree_gin standing in for Supabase)

### M2 — Auth & workspace
Spec inputs: 10, 11, 05.3. Verify: route-matrix test, bootstrap race test, cross-tenant probe suite.

- [x] Clerk wiring (@clerk/nextjs; ClerkProvider gated on key presence — keyless local mode renders §05.3 unavailable card; sign-in/up screens)
- [x] Middleware matrix (src/middleware.ts consumes lib/routes.ts single config object; anon → redirect w/ redirect_url or typed 401 envelope)
- [x] resolveWorkspace (lazy bootstrap, §09.9-6 race-safe upsert; withRls db-handle factory owns the JWT/claims bridge per §10.5)
- [x] Ctx + can() (server/context.ts; §11.2 vocabulary + §11.3 dormant role map)
- [x] Webhook handler (Svix verification; user.deleted → idempotent cascade delete; user.created advisory)
- [x] Verify gate green — route-matrix (20 routes × anon/authed), bootstrap race (N=12 → 1 workspace), cross-tenant probe suite (every scoped table, read+write probes), webhook signature tests; `pnpm verify:all` cumulative (2026-07-30). NOTE: live Clerk sign-in untestable without operator keys (HALT item logged; all key-independent paths verified)

### M3 — Portfolio Engine
Spec inputs: 12, 13, 16.2 Money/Qty. Verify: golden-file suite + property tests + 50k perf test (`pnpm test:engine`).

- [x] Pure engine (server/engine/portfolio: replay per §12.3/§12.4 — scaled-bigint math (×10¹² internal), average-cost, oversell split w/ incomplete_history + negative qty preserved, zero-price lots, orphan income, overdrawn cash, amount-consistency flags; banker's rounding at presentation only)
- [x] PricingSource (LastTradePricingSource §12.5; injected seam per §02.9; CostBasisMethod seam per §12.6)
- [x] Snapshot orchestration (advisory-lock serialized, daily backfill bounded 366 days w/ partial_backfill flag, reproducibility watermark, upsert on (workspace, as_of); added flags column + snapshot UPDATE grant migrations)
- [x] Analytics queries (§13.2 definitions as raw SQL: period aggregates, snapshot series w/ weekly downsampling >400 pts, realized-P&L-by-subtraction via realized_pnl_cum scalar (§13.3 amendment applied), flow-adjusted value change)
- [x] Verify gate green — `pnpm test:engine` (16 goldens hand-verified + 10 property/unit + 50k perf in 0.5s vs 20s budget); 21 integration tests (concurrent recompute serialization, metric parity §13.5); cumulative `pnpm verify:all` 69 tests (2026-07-30)

### M4 — Import pipeline
Spec inputs: 15, 05.9 API side, 17 import rows. Verify: 40-file adversarial corpus green; commit idempotency; seed determinism (two runs, identical output hash).

- [x] Parser (§15.2: encodings UTF-8/BOM/Latin-1, delimiter scoring, RFC 4180 via papaparse, headerless detection, Excel artifacts, typed whole-file rejects incl. 50k cap with count)
- [x] Mapper (§15.3: 60+ alias dictionary ×0.6 + value-shape ×0.4, ≥0.8 auto-assign, header-signature mapping profiles; verified against 10 real broker/bank formats)
- [x] Dry-run (§15.4: date formats in order, amount normalization w/ EU-locale per-column heuristic, type dictionary + lossy-type tally, sign auto-correct/reject, trade all-or-none, closed reject-code enum; 3-layer duplicate policy)
- [x] Commit (§15.5: single tx, advisory lock shared w/ recompute, idempotency key, instrument upsert, source_line lineage, cross-batch dupe decision, mapping-profile persistence)
- [x] Reject contract (§15.6: ≤10k inline jsonb; rejects.csv reproduces original columns + reject_reason)
- [x] Demo seed generator (§15.7: deterministic, 3 accounts/12 instruments/1,280 txs/24 months, all six planted findings D1–D6 verified present, 6-reject demo import variant, version-stamped; wired into seed runner + local DB seeded)
- [x] Verify gate green — 40-file adversarial corpus green; commit idempotency (double-commit = one batch); seed determinism (two runs identical hash); cumulative verify:all 127 unit + 30 integration (2026-07-30)

### M5 — API surface
Spec inputs: 17 (all), 18, 07.4–7. Verify: contract tests (all rows × valid/boundary/invalid); route-walk parity test.

- [x] withApi wrapper (§07.4: auth via Clerk or §20.8 test-session, workspace resolution inside RLS tx, Zod body/query parse, rate limits, §18.3 catch path, requestId+timing, envelope helpers)
- [x] Every endpoint row (§17.2 complete: dashboard, transactions+supersede, accounts+archive, series, anomalies+bulk, alerts CRUD+preview, notifications, investigations, feedback, imports full wizard API, workspace+demo, webhook, cron/nightly, health, docs; public-ID mapping at the wire layer only; nightly job w/ per-workspace recompute + detector evaluation; detector registry D1–D6 pulled forward from M7 because §14.2 paramsSchemas feed the alert endpoints)
- [x] Error taxonomy (§18.2 closed ErrorCode enum + AppError subclasses; 23505→duplicate_* in services; no-internals-in-500s secret-marker test)
- [x] Rate limits (§07.7 scopes, Upstash REST sliding window, fail-open w/ logged warning)
- [x] OpenAPI at /api/docs (zod-to-openapi v7 from the same request schemas; inventory-driven)
- [x] Verify gate green — contract tests all rows × valid/unauth/unknown-field/malformed (73); route-walk parity both directions + withApi-wrap gate; cumulative verify:all 131 unit / 30 integration / build (2026-07-30). NOTE: POST /investigations/:id/messages contractually 503 until M8 wires the gateway (logged deviation, flips in M8)

### M6 — App shell & screens
Spec inputs: 03, 04, 05 (S-01…S-13), 06.5–11. Verify: Playwright E2E US-01…US-05, US-07; hydration gate; kitchen-sink screenshots.

- [x] Tokens → components → screens in 05's build order (22 vendored ui primitives; icon registry §04.8; AppShell w/ sidebar+topbar+freshness+bell+palette+g-shortcuts §03.9; MoneyText/SeverityBadge/FreshnessIndicator/EmptyState/EvidenceDrawer per §04.6 contracts; S-01 marketing, S-03 dashboard (4 zones + charts w/ sr-only summaries), S-04 ledger (FilterBar, chips, sort, cursor load-more, row expansion+lineage), S-05 anomalies (tabs, bulk ack, optimistic 10s undo), S-06/07 investigations (SSE consumer, citations, degraded banner), S-08 alerts (schema-driven forms + preview), S-09/10/11 imports (4-step wizard), S-12 settings (5 tabs incl. danger zone), S-13 system screens + interstitial + kitchen-sink)
- [x] Query factory (qk + normalize §06.5.1; invalidateAfterImportCommit centralized; useAppMutation w/ §18.4 retry rules; apiFetch envelope parser bypassing browser HTTP cache)
- [x] URL state (useUrlFilters — Zod parse w/ defaults, 300ms debounce, history semantics; US-03 URL reconstruction proven in E2E)
- [x] Forms (RHF + zodResolver, shadcn Form aria bridge; alert dialog schema-driven per type)
- [x] Verify gate green — Playwright US-01…US-05 + US-07 walkthroughs, hydration gate, kitchen-sink screenshot: 9/9 passing against a production build w/ §20.8 test-session auth; cumulative verify:all + contract (73) + integration (30) green (2026-07-30). Bugs found & fixed by the E2E pass: batch public-ID mismatch, browser HTTP-cache staleness, eq(col,null) zero-rows, duplicate-rule tx-abort, demo-seed missing recompute, tsquery prefix search

### M7 — Detection & alerts
Spec inputs: 14, 05.6/05.8. Verify: detector fixtures (planted findings all fire on demo data); dedup double-run test; preview-parity test.

- [x] Detector registry (D1–D6 — built in M5, verified here: 17 unit fixtures incl. D2 cold-start + D4 pre-baseline abstention, trigram similarity, param rejection, evidence-hash stability; D2 fixed to evaluate every full month vs its own trailing baseline)
- [x] Alert rules (user rules run through the identical registry with user params; §14.5-3 per-detector failure isolation verified)
- [x] Notifications (§14.4: rule dedup = ruleId+evidenceHash unique; high-severity anomalies notify with anomaly: dedup keys; trigger_count/last_triggered_at maintained)
- [x] Preview parity (§05.8: preview count == direct registry run over the same 90d window, asserted)
- [x] Verify gate green — all six §15.7 planted findings fire on demo data (D1 FITLIFE pair, D2 fee spike, D3 $18.5k wire, D4 drift w/ steepened finale (dataset v1.1.0), D5 TSLA oversell, D6 quiet checking via user rule); dedup double-run inserts zero rows; integration 40/40, E2E 9/9, verify:all green (2026-07-30)

### M8 — AI investigation
Spec inputs: 08, 17.3, 05.7. Verify: `pnpm eval` (mocked transport green); US-06 E2E with mock; one real-API smoke if key present.

- [ ] Gateway + breaker
- [ ] Six tools
- [ ] SSE loop
- [ ] Citations
- [ ] Eval suite
- [ ] Verify gate green

### M9 — Hardening & launch
Spec inputs: 19, 20, 21, 22 gaps, 24, 25. Verify: Lighthouse CI ≥ budgets; axe zero serious/critical; `pnpm verify:all` fully green.

- [ ] axe per screen/state
- [ ] Budgets in CI
- [ ] CSP/headers
- [ ] Sentry
- [ ] Health endpoint
- [ ] README (visual, portfolio-grade)
- [ ] Launch checklist
- [ ] Verify gate green

---

## Completion Gate audit (27.6) — per-section acceptance checklists

To be audited with pass/fail notes when milestones complete. Failures block.

| Section | Audited | Result |
| --- | --- | --- |
| 02–25 | ⬜ pending | — |

## Deviations log

- None yet.
