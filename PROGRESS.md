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

- [ ] Pure engine
- [ ] PricingSource
- [ ] Snapshot orchestration
- [ ] Analytics queries
- [ ] Verify gate green

### M4 — Import pipeline
Spec inputs: 15, 05.9 API side, 17 import rows. Verify: 40-file adversarial corpus green; commit idempotency; seed determinism (two runs, identical output hash).

- [ ] Parser
- [ ] Mapper
- [ ] Dry-run
- [ ] Commit
- [ ] Reject contract
- [ ] Demo seed generator (15.7)
- [ ] Verify gate green

### M5 — API surface
Spec inputs: 17 (all), 18, 07.4–7. Verify: contract tests (all rows × valid/boundary/invalid); route-walk parity test.

- [ ] withApi wrapper
- [ ] Every endpoint row
- [ ] Error taxonomy
- [ ] Rate limits
- [ ] OpenAPI at /api/docs
- [ ] Verify gate green

### M6 — App shell & screens
Spec inputs: 03, 04, 05 (S-01…S-13), 06.5–11. Verify: Playwright E2E US-01…US-05, US-07; hydration gate; kitchen-sink screenshots.

- [ ] Tokens → components → screens in 05's build order
- [ ] Query factory
- [ ] URL state
- [ ] Forms
- [ ] Verify gate green

### M7 — Detection & alerts
Spec inputs: 14, 05.6/05.8. Verify: detector fixtures (planted findings all fire on demo data); dedup double-run test; preview-parity test.

- [ ] Detector registry (D1–D6)
- [ ] Alert rules
- [ ] Notifications
- [ ] Preview parity
- [ ] Verify gate green

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
