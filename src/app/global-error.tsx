"use client";

import "./globals.css";

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
      <body className="p-16 text-center font-sans">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mx-auto my-4 max-w-md text-muted-foreground">
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
          className="rounded-md border px-4 py-2"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
