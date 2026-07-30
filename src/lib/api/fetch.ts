import { ERROR_STATUS, type ErrorCode } from "@/lib/schemas/error-codes";

/** Typed client error mirroring ErrorCode (§18.4). */
export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly fields?: Record<string, string>,
    public readonly retryAfter?: number,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}

export type Envelope<T> = { data: T; meta?: { cursor?: string | null; total?: number | string } };

/** apiFetch — §18.4: parses the envelope; non-JSON synthesizes internal_error. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  const res = await fetch(`/api${path}`, {
    // TanStack Query owns client-side caching (§06.5); letting the browser HTTP
    // cache double-cache GETs serves stale data after mutations. The §17.2
    // Cache-Control header remains for CDN/curl consumers.
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new ApiError("internal_error", "Unexpected response from server.", res.status);
  }
  if (!res.ok) {
    const err = (parsed as { error?: { code?: ErrorCode; message?: string; fields?: Record<string, string>; retryAfter?: number; requestId?: string } }).error;
    throw new ApiError(
      err?.code ?? "internal_error",
      err?.message ?? "Something went wrong.",
      res.status,
      err?.fields,
      err?.retryAfter,
      err?.requestId,
    );
  }
  return parsed as Envelope<T>;
}

export { ERROR_STATUS };
