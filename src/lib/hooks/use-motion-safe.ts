"use client";

import { useReducedMotion } from "framer-motion";

/**
 * §03.8.3: single enforcement point for reduced motion — components never
 * query the media feature directly.
 */
export function useMotionSafe(): boolean {
  const reduced = useReducedMotion();
  return !reduced;
}
