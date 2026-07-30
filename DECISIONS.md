# DECISIONS.md — append-only decision log (spec §27.5)

Format per entry: date · question · options considered · choice · affected spec section.

---

**2026-07-30 · Operator config placeholders unfilled.** The launch prompt's Operator Config block contained placeholder values (`<...>`) for Clerk, Supabase, OpenAI, Upstash, Vercel. Options: (a) HALT everything immediately; (b) proceed with all work that does not require external credentials, run OpenAI as `MOCK` (explicitly permitted by the config), run Postgres locally via docker (spec 27.3 permits `supabase start` locally), and HALT only the specific tasks that hard-require live keys (Clerk live wiring in M2). Chose (b): 27.5 scopes HALT to the blocked item, not the build; §22 defines the mocked AI path; §10 is read for a keyless/dev strategy when M2 arrives. Affected: 27.3, 27.5, M2, M8.

**2026-07-30 · Visual README timing.** Operator instruction requires a highly visual, portfolio-grade README with images/GIFs; spec places README in M9 (§25). Options: (a) defer entirely to M9; (b) author the README early and keep it current, finalizing screenshots/GIFs in M9 when screens exist. Chose (b): operator instruction is additive, not conflicting; README content lands progressively, visual assets captured once M6 screens render. Affected: 25, M9.
