"use client";

// §18.5 root boundary: fatal, full-page, digest as the user-visible Reference.
// global-error replaces the root layout, so it renders its own <html>. The
// digest is reported to the error tracker via the beacon endpoint (§24.4) —
// fire-and-forget, never load-bearing.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (typeof window !== "undefined" && error.digest) {
    try {
      navigator.sendBeacon(
        "/api/client-error",
        JSON.stringify({ digest: error.digest }),
      );
    } catch {
      /* telemetry is best-effort */
    }
  }
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 2rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ maxWidth: 480, margin: "1rem auto", color: "#666" }}>
          The application hit a fatal error. Your data is safe.
          {error.digest ? (
            <>
              {" "}
              Reference: <code>{error.digest}</code>
            </>
          ) : null}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{ padding: "0.5rem 1rem", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
