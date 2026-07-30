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
