"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiError } from "@/lib/api/fetch";
import { qk } from "@/lib/api/keys";

/**
 * Centralized invalidation — §06.5.3: one function so no screen forgets a
 * dependency (S-05 acceptance). Import commit touches dashboard, transactions,
 * anomalies, notifications, imports.
 */
export function invalidateAfterImportCommit(qc: QueryClient): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["dashboard"] }),
    qc.invalidateQueries({ queryKey: ["transactions"] }),
    qc.invalidateQueries({ queryKey: ["anomalies"] }),
    qc.invalidateQueries({ queryKey: ["notifications"] }),
    qc.invalidateQueries({ queryKey: ["imports"] }),
    qc.invalidateQueries({ queryKey: ["series"] }),
  ]);
}

/** useAppMutation — §06.5.4: pending state, typed error mapping, toast policy. */
export function useAppMutation<TInput, TOutput>(opts: {
  mutationFn: (input: TInput) => Promise<TOutput>;
  invalidate?: readonly (readonly unknown[])[];
  successToast?: string;
  onSuccess?: (result: TOutput, qc: QueryClient) => void;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: opts.mutationFn,
    onSuccess: (result) => {
      for (const key of opts.invalidate ?? []) {
        void qc.invalidateQueries({ queryKey: key as unknown[] });
      }
      if (opts.successToast) toast.success(opts.successToast);
      opts.onSuccess?.(result, qc);
    },
    onError: (err) => {
      // §03.7: toasts only for async outcomes; validation errors render inline.
      if (err instanceof ApiError && err.code === "validation_failed") return;
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    },
    retry: false, // §06.13-2: mutations never auto-retry
  });
}

export { qk };
