# Launch checklist — portfolio debut (§25.4)

Tracked once, executed as the launch PR. Status legend: ✅ done · ⚙️ operator
(requires live credentials/deploy the build agent does not hold — see
DECISIONS.md).

## Demo mode polish

- ✅ One-click demo entry lands in the seeded workspace (Settings → Load demo
  data; `POST /api/workspace/demo`).
- ✅ Seed determinism verified byte-stable across two clean runs
  (`supabase/seed/demo-dataset.mjs`, fixed PRNG, dataset v1.1.0 — §15.7).
- ✅ Planted detector findings (D1–D6) all fire and are discoverable from the
  Anomalies screen in under two minutes (E2E-verified).

## README

- ✅ Architecture overview + stack rationale.
- ✅ §21.10 security non-goals and §23.9 free-tier caveats stated verbatim.
- ✅ Link to `/api/docs`; evidence pack linked (`evidence/`).

## Evidence pack

- ✅ Lighthouse CI summary (§20.8) — `evidence/lighthouse-summary.txt`.
- ✅ axe run summary (§19.4) — `evidence/axe-summary.json`.
- ✅ RLS probe output (§09.6) — `evidence/rls-probe.txt`.
- ⚙️ Keyboard walkthrough recording — needs a screen-capture session on a
  deployed build.

## Endpoints

- ✅ `/api/docs` live and matching the contract suite (§17.5; route-parity
  test enforces it).
- ⚙️ `/api/health` externally monitored (Checkly/UptimeRobot free tier) —
  needs the prod URL.

## Manual gates

- ⚙️ Both screen-reader walkthroughs (§19.4) — VoiceOver/NVDA sessions.
- ⚙️ Secrets rotated fresh (§21.8) — no live secrets were ever held.
- ⚙️ 7 days of backup artifacts (§23.12) — nightly workflow exists
  (`.github/workflows/nightly.yml`), needs `BACKUP_ENABLED` + secrets.
- ⚙️ Sentry alerts firing on a forced test event — needs `SENTRY_DSN`.

## Kitchen sink

- ✅ `/dev/kitchen-sink` renders every component state (§04.13) and passes axe;
  screenshots for the README regenerate via the E2E harness.
