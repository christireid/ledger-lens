"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef } from "react";

/**
 * useUrlFilters — §06.6: the single mechanism for view state. Parses
 * useSearchParams through a Zod schema (invalid/missing → defaults, never
 * crashes); router.replace debounced 300 ms for typed input; discrete actions
 * push one history entry so Back is meaningful.
 */
type FilterSchema<T> = {
  parse: (input: unknown) => T;
  safeParse: (input: unknown) => { success: true; data: T } | { success: false };
};

export function useUrlFilters<T extends Record<string, unknown>>(
  schema: FilterSchema<T>,
): {
  filters: T;
  set: (patch: Partial<T>, opts?: { history?: boolean }) => void;
  setDebounced: (patch: Partial<T>) => void;
  clear: () => void;
} {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filters = useMemo(() => {
    const raw: Record<string, unknown> = {};
    searchParams.forEach((value, key) => {
      raw[key] = value;
    });
    const parsed = schema.safeParse(raw);
    return parsed.success ? parsed.data : schema.parse({});
  }, [searchParams, schema]);

  const serialize = useCallback(
    (next: Record<string, unknown>) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(next)) {
        if (value === undefined || value === null || value === "" || value === false) continue;
        params.set(key, String(value));
      }
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname],
  );

  const set = useCallback(
    (patch: Partial<T>, opts?: { history?: boolean }) => {
      const url = serialize({ ...filters, ...patch });
      if (opts?.history) router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [filters, router, serialize],
  );

  const setDebounced = useCallback(
    (patch: Partial<T>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => set(patch), 300);
    },
    [set],
  );

  const clear = useCallback(() => {
    router.push(pathname, { scroll: false });
  }, [router, pathname]);

  return { filters, set, setDebounced, clear };
}
