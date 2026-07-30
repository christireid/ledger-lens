# DECISIONS.md — append-only decision log (spec §27.5)

Format per entry: date · question · options considered · choice · affected spec section.

---

**2026-07-30 · Operator config placeholders unfilled.** The launch prompt's Operator Config block contained placeholder values (`<...>`) for Clerk, Supabase, OpenAI, Upstash, Vercel. Options: (a) HALT everything immediately; (b) proceed with all work that does not require external credentials, run OpenAI as `MOCK` (explicitly permitted by the config), run Postgres locally via docker (spec 27.3 permits `supabase start` locally), and HALT only the specific tasks that hard-require live keys (Clerk live wiring in M2). Chose (b): 27.5 scopes HALT to the blocked item, not the build; §22 defines the mocked AI path; §10 is read for a keyless/dev strategy when M2 arrives. Affected: 27.3, 27.5, M2, M8.

**2026-07-30 · Visual README timing.** Operator instruction requires a highly visual, portfolio-grade README with images/GIFs; spec places README in M9 (§25). Options: (a) defer entirely to M9; (b) author the README early and keep it current, finalizing screenshots/GIFs in M9 when screens exist. Chose (b): operator instruction is additive, not conflicting; README content lands progressively, visual assets captured once M6 screens render. Affected: 25, M9.

**2026-07-30 · Repo layout conflict (06.3 vs 23.2).** §06.3 places all code under `src/` (`src/app`, `src/server`, `src/styles`); §23.2 shows `app/` at repo root and adds `src/db`, `supabase/`, `e2e/`, `evals/`, `scripts/`. Lower-numbered section wins → `src/app/`. Non-conflicting §23.2 additions (`src/db`, `supabase/`, `e2e/`, `evals/`, `scripts/`) adopted as-is. Affected: 06.3, 23.2.

**2026-07-30 · globals.css location (04.3 vs 06.3).** §04.3 says tokens live in `app/globals.css`; §06.3 shows `styles/globals.css`. Lower-numbered wins → `src/app/globals.css`. Affected: 04.3, 06.3.

**2026-07-30 · Versions.** Spec fixes React 18+ and App Router but no exact versions. Chose Next 15.5 + React 19 (current stable, best Clerk/RSC support), TypeScript 5.9, Tailwind v3.4 (spec's `tailwind.config.ts` token-mapping idiom is a v3 convention; v4 is CSS-first and would deviate), Zod v3 API (drizzle-zod/@hookform compat), Vitest 3. Pinned via lockfile per §21/§23. Affected: 06.2, 04.4, 23.

**2026-07-30 · Chart ramp + derived shadcn tokens.** §04.3.2 names the categorical ramp (teal, slate-blue, amber, plum, moss, clay) without HSL values, and §04.3.1 omits shadcn-required companions (card-foreground, popover, secondary, accent, input, destructive-foreground). Chose hand-tuned HSL values consistent with the named hues and the near-monochrome brand direction (§04.2), derived companions from the table's values (input=border, secondary/accent=muted, foregrounds from background/foreground). Contrast to be CI-verified in M9 per §04.3.2. Affected: 04.3.

**2026-07-30 · Env strictness outside production.** §07.9/§23.4 say missing required vars fail the build. With operator credentials absent (see first entry), a hard fail would block every milestone. Chose: prod parse enforces the full required set (build/deploy fails); local/test validate format when present and features gate on presence, failing loudly when invoked. This preserves the §07.9 guarantee where it matters (deploy) without fabricating credentials (§27.2d). Affected: 07.9, 23.4.

**2026-07-30 · Local database.** Docker daemon unavailable in this environment; host has Postgres 16 with contrib extensions. Chose the host cluster (`postgres://localhost:5432/ledger_lens`) as the §27.3 "supabase start locally" equivalent; an `auth.jwt()` stub (guarded — never replaces Supabase's own) reads the same `request.jwt.claims` GUC so RLS policies are identical across local and Supabase. Affected: 09.6, 23.4, 27.3.

**2026-07-30 · messages/message_citations workspace_id.** §09.3's column lists for messages/message_citations omit workspace_id, but §09.2 mandates workspace_id on every row (denormalized) and §09.6 requires RLS on all workspace-scoped tables. Governing principle (09.2, lower-numbered within the same section) wins: both tables carry workspace_id and RLS policies. Affected: 09.2, 09.3, 09.6.

**2026-07-30 · alert_rules unique via btree-md5.** §09.3 asks for "unique (workspace_id, type, params) via hash index on md5(params::text)"; Postgres hash indexes cannot be UNIQUE. Chose a unique btree index on (workspace_id, type, md5(params::text)) — same guarantee, valid DDL. Affected: 09.3.

**2026-07-30 · unaccent immutability wrapper.** §09.5's gin tsvector index uses unaccent(), which is STABLE and unusable in an index expression. Added `immutable_unaccent()` wrapper (standard Postgres practice) + btree_gin for the composite (workspace_id, tsvector) index. Affected: 09.5.

**2026-07-30 · message_role enum values.** §09.3 names the message_role enum without values; §16.3 lists MessageRole without values; §08 tool protocol implies user/assistant only (system prompt is not persisted as a message). Chose ('user','assistant'); additive evolution covers any future need. Affected: 09.2, 16.3.

**2026-07-30 · Keyless Clerk mode.** Operator Clerk keys absent (HALT item). Options: (a) block M2 entirely; (b) wire Clerk fully but gate on key presence — middleware treats all requests as anonymous (matrix behavior identical to anon), auth screens render the §05.3 designed "unavailable" card (the same card §10.7-6 requires for Clerk outages). Chose (b): route matrix, bootstrap, RLS bridge, and webhook are all fully built and tested; only the live hosted-component sign-in flow awaits keys. Affected: 10.2, 10.3, 05.3, M2.

**2026-07-30 · Env prod-strictness trigger.** `next build` sets NODE_ENV=production even for local builds, so keying the §23.4 required-set on NODE_ENV made every local build fail without operator credentials. Chose VERCEL_ENV==='production' || ENV_STRICT==='1' as the "deploy" signal — §07.9's fail-the-deploy guarantee intact, local builds green. Affected: 07.9, 23.4.

**2026-07-30 · Engine internal precision.** §12.2-4 demands integer money math with no intermediate rounding, but proportional average-cost (costBasis×q/qtyHeld) is not exactly representable at ×10⁴. Chose an internal ×10¹² scale (money 10⁴ × qty 10⁸ products are exact) with truncating proportional-cost division (exact at sell-to-zero, guaranteeing §12.7-4) and banker's rounding once at presentation. Affected: 12.2, 12.4.

**2026-07-30 · Snapshot flags persistence.** §16.3 Snapshot carries flags ('partial_backfill'|'stale') but §09.3's snapshot row has no flags column. Added an additive `flags text[]` column (0003) — §09.7 permits additive migrations; storing inside positions jsonb would corrupt its "array of Position objects" contract. Affected: 09.3, 16.3.

**2026-07-30 · Snapshot UPDATE grant.** 0001 granted app_user UPDATE only on "mutable" tables, omitting portfolio_snapshots; the §07.6 upsert requires UPDATE for ON CONFLICT DO UPDATE. Added grant (0004). Affected: 09.3, 21.

**2026-07-30 · Zero-floats rule mechanics.** §12.8 asks for a lint rule banning number arithmetic on Money/Qty; the branded-bigint types make any number↔Money arithmetic a TypeScript compile error (bigint/number mixing is illegal), so `pnpm typecheck` is the mechanical enforcement. No separate ESLint rule needed. Affected: 12.8.

**2026-07-30 · Demo dataset volume.** §15.7 says "~1,400 transactions"; the generator produces 1,280 with the D6 silence window (checking mutes its final 2 months). Options: pad with filler rows breaking realism, or accept 1,280 as within "~". Chose the latter — the normative content is the planted findings + shape, all verified by test. Affected: 15.7.

**2026-07-30 · Demo seed date fixed at 2026-07-01.** §15.7 says "24 months ending at seed date"; byte-stability (§23.10-5) forbids now(). Chose the constant DEMO_SEED_DATE='2026-07-01'; planted-finding recency (D1 pair, D6 silence) is anchored to it. Regenerating with a newer anchor is a deliberate golden-refresh per §25.6. Affected: 15.7, 23.10.

**2026-07-30 · Generator as plain .mjs.** The demo generator lives at supabase/seed/demo-dataset.mjs (plain JS + .d.ts) so the Node seed runner (no TS loader) and the app/tests can share one deterministic implementation. Affected: 15.7, 23.2.

**2026-07-30 · ErrorCode closure across 17.4+18.2.** §18.2's table omits codes that §17.4/§17.5/§11.4 name (403 forbidden, 400 invalid_cursor, 409 stale_state). The closed enum is the union of both sections — lower-numbered 17 wins on the code list; 18's subclass mapping extended accordingly. Affected: 17.4, 18.2.

**2026-07-30 · Raw upload persisted on the batch.** §17.2's validate/commit rows take no file body, so the upload must be retrievable server-side across wizard steps. Options: Supabase Storage (unavailable on the local stack) or an additive raw_content column (base64, bounded by the 10 MB cap). Chose the column; the §15.6 >10k-rows storage-object seam remains for later. Affected: 15.5, 09.3.

**2026-07-30 · Detector registry built in M5.** §27.4 lists the registry as an M7 output, but M5's alerts endpoints require §14.2 paramsSchemas and the preview endpoint requires run(). Built the full registry (D1–D6) in M5; M7 still owns its verification battery (fixtures on demo data, dedup double-run, preview parity, abstention tests). Gates unaffected — they are cumulative. Affected: 14.2, 27.4.

**2026-07-30 · Test-session auth for contract/E2E.** With Clerk keys absent, contract tests and E2E need a session mechanism. §20.8/§23.4 define DEMO_E2E_SECRET (preview-only, asserted absent in prod). withApi accepts x-demo-e2e-secret + x-demo-user-id when the env var is set — the same mechanism the spec prescribes for preview E2E. Affected: 20.8, 23.4, 10.3.

**2026-07-30 · Client HTTP cache bypass.** §17.2 gives GET /dashboard a 60s private cache; the browser then serves pre-mutation payloads after imports/seeding (TanStack Query §06.5 is the intended client cache). apiFetch now sends cache:"no-store"; the header remains for CDN/curl consumers. Affected: 17.2, 06.5.

**2026-07-30 · Demo seed recomputes inline.** §07.6's demo-seed row is "inline in bootstrap (synchronous, 3s budget)". Seeding now recomputes snapshots (366-day backfill) + runs detectors before returning (measured 1.5s locally) so the dashboard and anomaly queue are populated immediately. Affected: 07.6, 15.7.

**2026-07-30 · Arch-grep scope.** The M0 arbitrary-value grep flagged sizing utilities (max-w-[1440px] — itself the §03.4 shell spec) beyond §04.13's "color/spacing" ban. Narrowed to color/spacing arbitraries; the §04.3.3 type scale is respected (text-[10px] instances replaced with scale values). Affected: 04.13, 04.3.4.

**2026-07-30 · E2E runs against a production build.** Dev-server on-demand compilation caused flaky timeouts; §23.5's E2E stage targets a deployed (production) build anyway. playwright webServer = next build && next start. Affected: 22, 23.5.
