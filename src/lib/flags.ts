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
  /** F13 — demo seed dataset surfaces (§15.7) */
  f13: false,
  /** F14 — S-priority, dark until M0–M9 complete */
  f14: false,
} as const;

export type FlagKey = keyof typeof flags;
