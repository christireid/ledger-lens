// Vitest stub for the 'server-only' package guard — tests run in Node, where
// the real package intentionally throws. The build-time guarantee (§06.3)
// is enforced by Next's bundler in `pnpm build`, not by tests.
export {};
