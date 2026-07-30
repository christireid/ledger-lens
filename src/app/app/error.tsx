"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

// §05.11 route error boundary: §03.5 fatal treatment + digest for log correlation (§24).
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The page hit an unexpected error. Your data is safe.
        {error.digest && (
          <>
            {" "}
            Reference: <code className="font-mono">{error.digest}</code>
          </>
        )}
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/app/dashboard">Go to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
