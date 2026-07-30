/** Motion tokens — §03.8.1. A grep for raw duration literals in motion code returns zero (§03.12). */
export const MOTION = {
  duration: { fast: 0.12, base: 0.2, slow: 0.32 },
  ease: {
    standard: [0.2, 0, 0, 1] as const,
    exit: [0.4, 0, 1, 1] as const,
  },
} as const;
