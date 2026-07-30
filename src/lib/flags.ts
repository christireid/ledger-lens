/**
 * Feature flags — spec §07.9. Minimal constant module (no vendor) gating
 * S-priority features (F10–F14) so partially built work ships dark.
 * Flag debt is tracked in the roadmap (§26).
 */
export const flags = {
  /** F10 — S-priority, dark until M0–M9 complete */
  f10: false,
  /** F11 — S-priority, dark until M0–M9 complete */
  f11: false,
  /** F12 — S-priority, dark until M0–M9 complete */
  f12: false,
  /** F13 demo mode is M-priority (§02.5) — always on, consumed by the
   *  sign-up demo-intent path (§07.6) and the Settings demo actions. */
  f13: true, // flag-on: 2026-07-30

  /** F14 — S-priority, dark until M0–M9 complete */
  f14: false,
} as const;

export type FlagKey = keyof typeof flags;
