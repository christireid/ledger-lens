# Evidence pack (§25.4)

Machine-generated verification artifacts backing the launch checklist. Each
file is the captured output of a gate that also runs in CI (§23.5) — linked
artifacts, not screenshots of claims.

| File | Gate | Spec |
| --- | --- | --- |
| `axe-summary.json` | Zero serious/critical axe violations across marketing, all eight app screens (seeded demo state), and the kitchen sink | §19.4 |
| `lighthouse-summary.txt` | Median of 3 runs, desktop preset @1280px: LCP < 2500 ms, CLS < 0.02, TBT < 300 ms, performance ≥ 90 on `/`, `/app/dashboard`, `/app/ledger` | §20.8 |
| `bundle-budgets.txt` | Gzipped first-load JS per route vs. the §20.3 ceilings (`pnpm size`) | §20.3 |
| `rls-probe.txt` | Cross-tenant isolation probe: 11 integration assertions that RLS + column grants deny cross-workspace reads/writes and ledger mutation | §09.6 |

Regenerate with: `pnpm e2e e2e/a11y.spec.ts`, `node scripts/lighthouse-ci.mjs`,
`pnpm size`, `pnpm test:integration src/server/db/cross-tenant.integration.test.ts`.

Known gaps (operator-config, see DECISIONS.md): keyboard walkthrough recording
and screen-reader walkthroughs (§19.4 manual gates), 7-day backup artifact
history, and Sentry forced-event alert check require a deployed environment
with live credentials.
