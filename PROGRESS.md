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

- [ ] Next app scaffold (App Router, strict TS)
- [ ] Tailwind + design tokens (04.3 globals.css)
- [ ] Lint rules incl. architecture greps
- [ ] server/env.ts (validated env per 23.4)
- [ ] pnpm scripts incl. `verify:all`
- [ ] Verify gate green

### M1 — Schema & data layer
Spec inputs: 09 (all), 16, 07.3. Verify: `pnpm db:migrate && pnpm test:unit` (marshal round-trip, enum parity, DDL snapshot).

- [ ] Drizzle schema + migrations
- [ ] RLS policies
- [ ] Marshal layer
- [ ] Enum-parity test
- [ ] Seed runner shell
- [ ] Verify gate green

### M2 — Auth & workspace
Spec inputs: 10, 11, 05.3. Verify: route-matrix test, bootstrap race test, cross-tenant probe suite.

- [ ] Clerk wiring
- [ ] Middleware matrix
- [ ] resolveWorkspace
- [ ] Ctx + can()
- [ ] Webhook handler
- [ ] Verify gate green

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
