"use client";

import { useResolveDirectoryNames } from "../reference/directory-names";

import { conflictMessage, conflictTeacherId } from "./conflict-message";

type Lookups = Parameters<typeof conflictMessage>[1];

/**
 * Builds the "who is in the way" sentence for a schedule clash. The clashing
 * lesson's teacher is not always among the people on screen, so that one
 * person is looked up (and cached) before the sentence is made.
 */
export function useNamedConflict(): (
  error: unknown,
  lookups: Lookups,
  t: (key: string, values?: Record<string, string>) => string,
) => Promise<string | null> {
  const resolveNames = useResolveDirectoryNames();
  return async (error, lookups, t) => {
    const clashTeacher = conflictTeacherId(error);
    const extra =
      clashTeacher && !lookups.teacherMap.has(clashTeacher)
        ? await resolveNames([clashTeacher])
        : undefined;
    return conflictMessage(
      error,
      extra ? { ...lookups, teacherMap: new Map([...lookups.teacherMap, ...extra]) } : lookups,
      t,
    );
  };
}
