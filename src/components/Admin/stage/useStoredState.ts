"use client";

import { useCallback, useState } from "react";

/**
 * State kept in this browser's localStorage (per device on purpose: the
 * tablet and the laptop want different views). Only for components that
 * render after mount — the initializer reads storage synchronously.
 */
export function useStoredState<T>(key: string, initial: T, accept: (value: unknown) => value is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(key) ?? "null") as unknown;

      return accept(stored) ? stored : initial;
    } catch {
      return initial;
    }
  });

  const update = useCallback(
    (next: T | ((previous: T) => T)) =>
      setValue((previous) => {
        const resolved = typeof next === "function" ? (next as (previous: T) => T)(previous) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // Private mode or full: the state still works for this visit.
        }

        return resolved;
      }),
    [key]
  );

  return [value, update] as const;
}
