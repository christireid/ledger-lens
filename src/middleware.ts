import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { decideRoute } from "@/lib/routes";

/**
 * Session propagation — §10.3. clerkMiddleware with the shared route matrix
 * (lib/routes.ts). When Clerk keys are absent (local keyless mode, see
 * DECISIONS.md), every request is treated as anonymous — the matrix behavior
 * is identical to an anonymous user, and auth screens render the §05.3
 * designed unavailable card.
 */

const hasClerkKeys = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY,
);

function apply(
  req: NextRequest,
  isAuthenticated: boolean,
): NextResponse | null {
  const decision = decideRoute(req.nextUrl.pathname, isAuthenticated);
  switch (decision.kind) {
    case "redirect-sign-in": {
      // §03.11-8: preserve deep link
      const url = new URL("/sign-in", req.url);
      url.searchParams.set(
        "redirect_url",
        req.nextUrl.pathname + req.nextUrl.search,
      );
      return NextResponse.redirect(url);
    }
    case "api-401":
      // §18 envelope; requestId minted by withApi for handled routes — the
      // middleware 401 is the pre-handler short-circuit.
      return NextResponse.json(
        {
          error: {
            code: "unauthorized",
            message: "Authentication required.",
            requestId: req.headers.get("x-request-id") ?? "middleware",
          },
        },
        { status: 401 },
      );
    case "pass":
      return null;
  }
}

const withClerk = clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  const res = apply(req, userId !== null) ?? NextResponse.next();
  return withSecurityHeaders(res, req.nextUrl.pathname);
});

function testSessionAuthed(req: NextRequest): boolean {
  // §20.8 preview/E2E test sessions — enabled only when DEMO_E2E_SECRET is set
  // (asserted absent in prod by the env module).
  const secret = process.env.DEMO_E2E_SECRET;
  if (!secret) return false;
  const headerSecret = req.headers.get("x-demo-e2e-secret");
  if (headerSecret === secret && req.headers.get("x-demo-user-id")) return true;
  const cookie = req.cookies.get("demo_e2e_session")?.value;
  return cookie?.startsWith(`${secret}:`) ?? false;
}

function keyless(req: NextRequest) {
  return apply(req, testSessionAuthed(req)) ?? NextResponse.next();
}

/**
 * §21.4 CSP — nonce per request for app/auth routes; the marketing page stays
 * static (SSG) with a no-nonce policy set in next.config headers.
 */
function withSecurityHeaders(res: NextResponse, pathname: string): NextResponse {
  if (pathname === "/" || pathname.startsWith("/api/")) return res;
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const clerkApi = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    ? "https://*.clerk.accounts.dev https://clerk.com"
    : "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${clerkApi}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://img.clerk.com",
    "font-src 'self'",
    `connect-src 'self' ${clerkApi}`.trim(),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("x-nonce", nonce);
  return res;
}

function keylessWithHeaders(req: NextRequest) {
  return withSecurityHeaders(keyless(req), req.nextUrl.pathname);
}

export default hasClerkKeys ? withClerk : keylessWithHeaders;

export const config = {
  matcher: [
    // Skip Next internals and static assets
    "/((?!_next|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|woff2?)$).*)",
  ],
};
