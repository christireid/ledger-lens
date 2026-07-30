"use client";

import { useCallback, useEffect, useState } from "react";

/** §06.8: localStorage-backed preference with SSR-safe default. */
export function usePersistedPreference<T extends string>(
  key: string,
  defaultValue: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(defaultValue);
  useEffect(() => {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) setValue(stored as T);
  }, [key]);
  const update = useCallback(
    (next: T) => {
      setValue(next);
      window.localStorage.setItem(key, next);
    },
    [key],
  );
  return [value, update];
}
