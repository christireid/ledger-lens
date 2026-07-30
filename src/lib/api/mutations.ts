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

// §18.4: repeated unauthorized handling dedupes at module level — one redirect,
// no toast storm, deep link preserved.
let redirectingToSignIn = false;

/** §18.2 code → UI dispatch (§18.4). Returns true when fully handled. */
function dispatchErrorCode(err: ApiError): boolean {
  switch (err.code) {
    case "validation_failed":
      return true; // §03.7: renders inline via the form layer, never a toast
    case "unauthorized": {
      if (!redirectingToSignIn && typeof window !== "undefined") {
        redirectingToSignIn = true;
        const back = window.location.pathname + window.location.search;
        window.location.assign(`/sign-in?redirect_url=${encodeURIComponent(back)}`);
      }
      return true; // no toast (§18.4)
    }
    case "rate_limited":
      toast.error(
        err.retryAfter
          ? `Slow down — try again in ${err.retryAfter}s.`
          : "Slow down — too many requests.",
      );
      return true;
    case "stale_state":
      toast.error("This item changed underneath you — refreshing.");
      return true;
    case "upstream_unavailable":
      toast.error("A dependent service is unavailable. Try again shortly.");
      return true;
    default:
      return false;
  }
}

/**
 * useAppMutation — §06.5.4/§18.4: pending state, typed code→UI dispatch,
 * toast policy, and optimistic rollback via the onMutate snapshot when
 * `optimisticKeys` is passed.
 */
export function useAppMutation<TInput, TOutput>(opts: {
  mutationFn: (input: TInput) => Promise<TOutput>;
  invalidate?: readonly (readonly unknown[])[];
  successToast?: string;
  onSuccess?: (result: TOutput, qc: QueryClient) => void;
  /** query keys snapshotted before mutate and restored on error (§18.4). */
  optimisticKeys?: readonly (readonly unknown[])[];
  onMutateUpdate?: (qc: QueryClient, input: TInput) => void;
}) {
  const qc = useQueryClient();
  return useMutation<TOutput, Error, TInput, { snapshots: Array<[readonly unknown[], unknown]> }>({
    mutationFn: opts.mutationFn,
    onMutate: (input) => {
      const snapshots: Array<[readonly unknown[], unknown]> = [];
      for (const key of opts.optimisticKeys ?? []) {
        snapshots.push([key, qc.getQueryData(key as unknown[])]);
      }
      opts.onMutateUpdate?.(qc, input);
      return { snapshots };
    },
    onSuccess: (result) => {
      for (const key of opts.invalidate ?? []) {
        void qc.invalidateQueries({ queryKey: key as unknown[] });
      }
      if (opts.successToast) toast.success(opts.successToast);
      opts.onSuccess?.(result, qc);
    },
    onError: (err, _input, context) => {
      // §18.4: automatic rollback of optimistic updates via the snapshot.
      for (const [key, data] of context?.snapshots ?? []) {
        qc.setQueryData(key as unknown[], data);
      }
      if (err instanceof ApiError && dispatchErrorCode(err)) return;
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    },
    retry: false, // §06.13-2: mutations never auto-retry
  });
}

export { qk };
