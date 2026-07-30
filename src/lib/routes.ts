/**
 * Route access matrix — §10.3. Public exceptions enumerated in ONE config
 * object (§10.8 acceptance); the middleware and the route-matrix test both
 * consume this module, so behavior and test cannot drift.
 */

export const PUBLIC_ROUTES = [
  "/", // S-01 marketing (SSG)
  "/sign-in(/.*)?",
  "/sign-up(/.*)?",
  "/api/webhooks/clerk", // Svix signature auth (§10.2)
  "/api/cron/(.+)", // CRON_SECRET header auth (§10.6)
  "/api/health", // §24 health endpoint
  "/api/docs(/.*)?", // OpenAPI, public read (§17)
] as const;

export type RouteDecision =
  | { kind: "pass" }
  | { kind: "redirect-sign-in" }
  | { kind: "api-401" };

const publicMatchers = PUBLIC_ROUTES.map(
  (p) => new RegExp(`^${p.replace(/\//g, "\\/")}$`),
);

export function isPublicRoute(pathname: string): boolean {
  return publicMatchers.some((re) => re.test(pathname));
}

/**
 * §10.3: public routes pass; /app/* and /api/* (minus public exceptions)
 * require a session — unauthenticated app routes redirect to sign-in with
 * redirect_url, API routes return typed 401 (§18).
 */
export function decideRoute(
  pathname: string,
  isAuthenticated: boolean,
): RouteDecision {
  if (isPublicRoute(pathname)) return { kind: "pass" };
  if (isAuthenticated) return { kind: "pass" };
  if (pathname.startsWith("/api/")) return { kind: "api-401" };
  if (pathname.startsWith("/app")) return { kind: "redirect-sign-in" };
  // Anything else unauthenticated (unknown top-level path): let Next 404 it.
  return { kind: "pass" };
}
