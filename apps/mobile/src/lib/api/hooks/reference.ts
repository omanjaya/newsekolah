// Shared reference data (classes, subjects, periods, rooms, directory,
// schedules) and the active-year helper every other hooks module depends on.
import { queryKeys } from "@newsekolah/api-client";
import { useQuery } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { REFERENCE_STALE_MS, type Period } from "./types";

const ACADEMIC_KEY = ["academic"] as const;

export function useActiveYearId(): string {
  const { me } = useAuth();
  return me?.active_academic_year?.id ?? "";
}

export function useClasses() {
  const yearId = useActiveYearId();
  return useQuery({
    queryKey: queryKeys.classes(yearId),
    queryFn: () =>
      getApiClient().GET("/v1/academic/classes", {
        params: { query: { academic_year_id: yearId, page_size: 200 } },
      }),
    enabled: yearId !== "",
    staleTime: REFERENCE_STALE_MS,
  });
}

export function useSubjects() {
  return useQuery({
    queryKey: queryKeys.subjects(),
    queryFn: () =>
      getApiClient().GET("/v1/academic/subjects", { params: { query: { page_size: 200 } } }),
    staleTime: REFERENCE_STALE_MS,
  });
}

export function usePeriods() {
  return useQuery({
    queryKey: queryKeys.periods(),
    queryFn: async () => {
      const client = getApiClient();
      const templates = await client.GET("/v1/academic/period-templates");
      const template = templates.data.find((x) => x.is_default) ?? templates.data[0];
      if (!template) return [] as Period[];
      const periods = await client.GET("/v1/academic/period-templates/{templateId}/periods", {
        params: { path: { templateId: template.id } },
      });
      return [...periods.data].sort((a, b) => a.sequence - b.sequence);
    },
    staleTime: REFERENCE_STALE_MS,
  });
}

export function useRooms() {
  return useQuery({
    queryKey: [...ACADEMIC_KEY, "rooms"],
    queryFn: () =>
      getApiClient().GET("/v1/academic/rooms", { params: { query: { page_size: 200 } } }),
    staleTime: REFERENCE_STALE_MS,
  });
}

// Directory: names for pickers (no contact details) -- used by the
// substitution form to find a substitute teacher by name instead of a raw
// user id, and by the student home screen to resolve a schedule block's
// teacher_user_id to a display name.

export function useDirectory(profileKind: "teacher", search: string) {
  return useQuery({
    queryKey: queryKeys.directory(`${profileKind}:${search}`),
    queryFn: () =>
      getApiClient().GET("/v1/directory/users", {
        params: { query: { profile_kind: profileKind, q: search || undefined, limit: 20 } },
      }),
    staleTime: REFERENCE_STALE_MS,
  });
}

// My own schedule blocks for one weekday -- used by the substitution form
// so a teacher picks which of their own classes needs a stand-in instead
// of typing a schedule id by hand.

export function useMySchedules(dayOfWeek: number) {
  const yearId = useActiveYearId();
  const { me } = useAuth();
  return useQuery({
    queryKey: queryKeys.schedules({
      academic_year_id: yearId,
      teacher_user_id: me?.id,
      day_of_week: dayOfWeek,
    }),
    queryFn: () =>
      getApiClient().GET("/v1/schedules", {
        params: {
          query: { academic_year_id: yearId, teacher_user_id: me?.id, day_of_week: dayOfWeek },
        },
      }),
    enabled: yearId !== "" && Boolean(me?.id),
  });
}

/** Every active teacher's name, fetched once and cached -- enough to resolve
 * a schedule block's teacher_user_id without a per-id lookup endpoint (the
 * directory API only searches by name). limit 200 mirrors the ceiling the
 * API documents for "every teacher at once" lookups. */
export function useTeachers() {
  return useDirectory("teacher", "");
}

/** The signed-in student's own class schedule for one weekday, used for the
 * home screen's "next lesson" card and today's schedule list. class_id
 * comes from `me.current_class` (only set for students with an active
 * enrollment); the query stays disabled otherwise rather than guessing. */
export function useMyTodaySchedule(dayOfWeek: number) {
  const yearId = useActiveYearId();
  const { me } = useAuth();
  const classId = me?.current_class?.id;
  return useQuery({
    queryKey: queryKeys.schedules({
      academic_year_id: yearId,
      class_id: classId,
      day_of_week: dayOfWeek,
    }),
    queryFn: () =>
      getApiClient().GET("/v1/schedules", {
        params: { query: { academic_year_id: yearId, class_id: classId, day_of_week: dayOfWeek } },
      }),
    enabled: yearId !== "" && Boolean(classId),
  });
}
