"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useApiClient } from "../../lib/api/client";
import { useActiveYear } from "../../lib/hooks/use-active-year";

export type ClassRef = components["schemas"]["Class"];
export type SubjectRef = components["schemas"]["Subject"];
export type PeriodRef = components["schemas"]["Period"];

/**
 * Reference lists most screens need to turn ids into names (schedules,
 * attendance and permits payloads carry ids only). Cached for the session
 * with a long stale time: master data changes rarely during a school day.
 */
const REFERENCE_STALE_MS = 5 * 60 * 1000;

export function useClassesQuery(enabled = true) {
  const client = useApiClient();
  const year = useActiveYear();
  return useQuery({
    queryKey: queryKeys.classes(year.id),
    queryFn: () =>
      client.GET("/v1/academic/classes", {
        params: { query: { academic_year_id: year.id, page_size: 200 } },
      }),
    enabled: enabled && year.id !== "",
    staleTime: REFERENCE_STALE_MS,
  });
}

export function useSubjectsQuery(enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.subjects(),
    queryFn: () => client.GET("/v1/academic/subjects", { params: { query: { page_size: 200 } } }),
    enabled,
    staleTime: REFERENCE_STALE_MS,
  });
}

/** Periods of the default template, ordered by sequence. */
export function usePeriodsQuery(enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.periods(),
    queryFn: async () => {
      const templates = await client.GET("/v1/academic/period-templates");
      const template = templates.data.find((t) => t.is_default) ?? templates.data[0];
      if (!template) return { template: null, data: [] as PeriodRef[] };
      const periods = await client.GET("/v1/academic/period-templates/{templateId}/periods", {
        params: { path: { templateId: template.id } },
      });
      return {
        template,
        data: [...periods.data].sort((a, b) => a.sequence - b.sequence),
      };
    },
    enabled,
    staleTime: REFERENCE_STALE_MS,
  });
}

export type DirectoryUser = components["schemas"]["DirectoryUser"];
export type ProfileKind = components["schemas"]["ProfileKind"];

/** Names for id lookups; readable by every signed-in user (no contact data). */
export function useDirectoryQuery(profileKind?: ProfileKind, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.directory(profileKind ?? "all"),
    queryFn: () =>
      client.GET("/v1/directory/users", {
        params: { query: { ...(profileKind ? { profile_kind: profileKind } : {}), limit: 500 } },
      }),
    enabled,
    staleTime: REFERENCE_STALE_MS,
  });
}

export function useTeachersQuery(enabled = true) {
  return useDirectoryQuery("teacher", enabled);
}

export function useSchoolDaysQuery(enabled = true) {
  const client = useApiClient();
  const year = useActiveYear();
  return useQuery({
    queryKey: queryKeys.schoolDays(year.id),
    queryFn: () =>
      client.GET("/v1/academic/years/{yearId}/school-days", {
        params: { path: { yearId: year.id } },
      }),
    enabled: enabled && year.id !== "",
    staleTime: REFERENCE_STALE_MS,
  });
}

export type Enrollment = components["schemas"]["Enrollment"];

/** Active enrollments of one class, for pickers that narrow a student list by class. */
export function useClassEnrollmentsQuery(classId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.enrollments(classId),
    queryFn: () =>
      client.GET("/v1/academic/classes/{classId}/enrollments", {
        params: { path: { classId }, query: { page_size: 200 } },
      }),
    enabled: enabled && classId !== "",
    staleTime: REFERENCE_STALE_MS,
  });
}

export function useLookup<T extends { id: string }>(items: T[] | undefined): Map<string, T> {
  return useMemo(() => new Map((items ?? []).map((item) => [item.id, item])), [items]);
}
