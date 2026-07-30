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
  return apply(req, userId !== null) ?? NextResponse.next();
});

function keyless(req: NextRequest) {
  return apply(req, false) ?? NextResponse.next();
}

export default hasClerkKeys ? withClerk : keyless;

export const config = {
  matcher: [
    // Skip Next internals and static assets
    "/((?!_next|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|woff2?)$).*)",
  ],
};
