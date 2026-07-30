# Changelog

Releases are date-tagged (§25.3); entries are curated from squash-commit
titles at tag time. The MVP build carries the additional `v1.0.0-mvp` tag
required by the build protocol's completion gate (§27.6).

## 2026.07.30 — v1.0.0-mvp

First complete build of the Ledger Lens MVP specification (§00–§27):

- **Foundation** — Next.js 15 App Router, TypeScript strict, tokenized design
  system, typed env module, architecture lint gates.
- **Data layer** — Drizzle + Postgres with row-level security, column-grant
  ledger immutability, forward-only migrations, deterministic demo seed.
- **Portfolio engine** — pure deterministic replay (average cost, oversell and
  incomplete-history flags), snapshot orchestration with advisory locks.
- **Import pipeline** — CSV parse/map/validate, three-layer duplicate policy,
  idempotent commits, adversarial fixture corpus.
- **API surface** — `withApi` envelope, closed error taxonomy, rate limiting,
  OpenAPI docs, contract + route-parity suites.
- **App screens** — dashboard, ledger, anomalies, investigations, alerts,
  imports, settings; URL-held filters; kitchen sink.
- **Detection & alerts** — six detectors with evidence-hash dedup, planted
  demo findings, nightly job, alert rules on the same engine.
- **AI investigator** — transport seam (mock + OpenAI), six read-only tools,
  SSE tool loop with server-side citations, 29-case eval suite.
- **Hardening** — CSP nonce + security headers, bundle budgets, Lighthouse CI,
  axe gate, structured logging, Sentry seam, CI pipeline, launch checklist.
