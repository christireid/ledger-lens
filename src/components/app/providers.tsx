"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import * as React from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api/fetch";

/** §06.5: per-request QueryClient on the server; §18.4 retry rules. */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 15 * 60_000, // §20.6
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          // §18.4: GETs retry ≤2 — network failures, 5xx, and rate_limited only.
          if (error instanceof ApiError && error.status < 500 && error.code !== "rate_limited") {
            return false;
          }
          return failureCount < 2;
        },
        // §18.4: full jitter; rate_limited honors retryAfter.
        retryDelay: (attempt, error) => {
          if (error instanceof ApiError && error.code === "rate_limited" && error.retryAfter) {
            return error.retryAfter * 1000;
          }
          return Math.random() * Math.min(1000 * 2 ** attempt, 8000);
        },
      },
      mutations: { retry: false },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function Providers({
  children,
  nonce,
}: {
  children: React.ReactNode;
  /** §21.4 — per-request CSP nonce for the next-themes inline script. */
  nonce?: string | undefined;
}) {
  const queryClient = getQueryClient();
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem {...(nonce ? { nonce } : {})}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
