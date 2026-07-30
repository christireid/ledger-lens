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
  return apply(req, userId !== null) ?? securedNext(req);
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
  return apply(req, testSessionAuthed(req)) ?? securedNext(req);
}

/**
 * §21.4 CSP — nonce generated per request in the middleware. The nonce and
 * the policy travel on the REQUEST headers so Next.js stamps the nonce onto
 * every script tag it renders (this requires dynamic rendering — the root
 * layout reads headers(), which opts every HTML route in); the same policy is
 * mirrored onto the response. API routes serve JSON and are skipped.
 */
function securedNext(req: NextRequest): NextResponse {
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  // §02.5 F13/§07.6: ?demo=1 (marketing "Try the demo" → sign-up) survives the
  // auth round-trip as a short-lived cookie; bootstrap consumes it.
  const wantsDemo = req.nextUrl.searchParams.get("demo") === "1";
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const clerkApi = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    ? " https://*.clerk.accounts.dev https://clerk.com"
    : "";
  // §21.4 verbatim; 'unsafe-eval' is dev-only (webpack HMR), never shipped.
  const devEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}${clerkApi}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://img.clerk.com",
    "font-src 'self'",
    `connect-src 'self'${clerkApi}`,
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  if (wantsDemo) {
    res.cookies.set("demo_intent", "1", { maxAge: 3600, sameSite: "lax", path: "/" });
  }
  return res;
}

export default hasClerkKeys ? withClerk : keyless;

export const config = {
  matcher: [
    // Skip Next internals and static assets
    "/((?!_next|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|woff2?)$).*)",
  ],
};
