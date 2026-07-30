/**
 * §05.3 / §10.7-6: Clerk outage (or unconfigured local keyless mode) renders a
 * designed error card — typographic, tokened, no cached-session bypass.
 */
export function AuthUnavailableCard() {
  return (
    <div className="w-full max-w-md rounded-lg border bg-card p-8 shadow-sm">
      <h1 className="text-2xl font-semibold text-card-foreground">
        Sign-in unavailable
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        The authentication service is currently unreachable. Your data is
        unaffected. Please try again in a few minutes.
      </p>
      <p className="mt-6 text-xs text-muted-foreground">
        If this is a local development environment, set{" "}
        <code className="font-mono">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and{" "}
        <code className="font-mono">CLERK_SECRET_KEY</code> in{" "}
        <code className="font-mono">.env.local</code>.
      </p>
    </div>
  );
}
