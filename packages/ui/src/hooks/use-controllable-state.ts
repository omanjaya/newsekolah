"use client";

import { useCallback, useState } from "react";

/**
 * Lets a control work both ways: controlled when the caller passes `value`
 * (a react-hook-form `Controller`, a filter in the URL), uncontrolled with
 * `defaultValue` otherwise. `onChange` fires in both modes.
 */
export function useControllableState<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (next: T) => void,
): [T, (next: T) => void] {
  const [internal, setInternal] = useState(defaultValue);
  const controlled = value !== undefined;

  const setValue = useCallback(
    (next: T) => {
      if (!controlled) setInternal(next);
      onChange?.(next);
    },
    [controlled, onChange],
  );

  return [controlled ? value : internal, setValue];
}
