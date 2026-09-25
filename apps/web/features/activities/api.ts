"use client";

import { type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type Extracurricular = components["schemas"]["Extracurricular"];
export type ExtracurricularWrite = components["schemas"]["ExtracurricularWrite"];
export type Membership = components["schemas"]["Membership"];
export type StudentMembership = components["schemas"]["StudentMembership"];
export type Meeting = components["schemas"]["Meeting"];
export type AttendanceEntry = components["schemas"]["AttendanceEntry"];
export type AttendanceStatus = components["schemas"]["AttendanceStatus"];
export type MembershipPolicy = components["schemas"]["MembershipPolicy"];
export type ActivityEvent = components["schemas"]["ActivityEvent"];
export type ActivityEventWrite = components["schemas"]["ActivityEventWrite"];
export type Achievement = components["schemas"]["Achievement"];
export type AchievementWrite = components["schemas"]["AchievementWrite"];
export type AchievementLevel = components["schemas"]["AchievementLevel"];

/**
 * Query keys local to this feature (not added to the shared
 * `packages/api-client` registry, matching how the discipline feature
 * scopes its own keys) all under `["activities", ...]` so a single prefix
 * invalidates everything below.
 */
const keys = {
  clubs: (includeInactive: boolean) => ["activities", "clubs", includeInactive] as const,
  club: (id: string) => ["activities", "clubs", "detail", id] as const,
  members: (clubId: string, includeLeft: boolean) =>
    ["activities", "clubs", clubId, "members", includeLeft] as const,
  myClubs: () => ["activities", "me", "clubs"] as const,
  meetings: (clubId: string) => ["activities", "clubs", clubId, "meetings"] as const,
  roster: (meetingId: string) => ["activities", "meetings", meetingId, "roster"] as const,
  membershipPolicy: () => ["activities", "membership-policy"] as const,
  events: (from: string, to: string) => ["activities", "events", from, to] as const,
  event: (id: string) => ["activities", "events", "detail", id] as const,
  achievements: (studentId: string, classId: string) =>
    ["activities", "achievements", studentId, classId] as const,
};

function useInvalidateActivities() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["activities"] });
}

// Extracurricular catalogue.

export function useExtracurricularsQuery(includeInactive = false) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.clubs(includeInactive),
    queryFn: () =>
      client.GET("/v1/activities/extracurriculars", {
        params: { query: { include_inactive: includeInactive } },
      }),
  });
}

export function useExtracurricularQuery(clubId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.club(clubId),
    queryFn: () =>
      client.GET("/v1/activities/extracurriculars/{clubId}", { params: { path: { clubId } } }),
    enabled: enabled && clubId !== "",
  });
}

export function useCreateExtracurricularMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: (body: ExtracurricularWrite) =>
      client.POST("/v1/activities/extracurriculars", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useUpdateExtracurricularMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: ({ id, ...body }: ExtracurricularWrite & { id: string }) =>
      client.PUT("/v1/activities/extracurriculars/{clubId}", {
        params: { path: { clubId: id } },
        body,
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useDeleteExtracurricularMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/activities/extracurriculars/{clubId}", {
        params: { path: { clubId: id } },
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useMembershipPolicyQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.membershipPolicy(),
    queryFn: () => client.GET("/v1/activities/membership-policy"),
  });
}

export function useUpdateMembershipPolicyMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: (maxClubsPerStudent: number) =>
      client.PUT("/v1/activities/membership-policy", {
        body: { max_clubs_per_student: maxClubsPerStudent },
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

// Membership.

export function useClubMembersQuery(clubId: string, includeLeft = false) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.members(clubId, includeLeft),
    queryFn: () =>
      client.GET("/v1/activities/extracurriculars/{clubId}/members", {
        params: { path: { clubId }, query: { include_left: includeLeft } },
      }),
    enabled: clubId !== "",
  });
}

export function useJoinClubMutation(clubId: string) {
  const client = useApiClient();
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: (body: { student_user_id: string; joined_on: string }) =>
      client.POST("/v1/activities/extracurriculars/{clubId}/members", {
        params: { path: { clubId } },
        body,
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useLeaveClubMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: ({ membershipId, leftOn }: { membershipId: string; leftOn: string }) =>
      client.POST("/v1/activities/memberships/{membershipId}/leave", {
        params: { path: { membershipId } },
        body: { left_on: leftOn },
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useMyClubsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.myClubs(),
    queryFn: () => client.GET("/v1/me/clubs"),
  });
}

export function useClubMembershipReportQuery(clubId: string, from: string, to: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["activities", "clubs", clubId, "reports", "membership", from, to] as const,
    queryFn: () =>
      client.GET("/v1/activities/extracurriculars/{clubId}/reports/membership", {
        params: { path: { clubId }, query: { from, to } },
      }),
    enabled: clubId !== "" && from !== "" && to !== "",
  });
}

// Meetings and attendance.

export function useMeetingsQuery(clubId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.meetings(clubId),
    queryFn: () =>
      client.GET("/v1/activities/extracurriculars/{clubId}/meetings", {
        params: { path: { clubId } },
      }),
    enabled: clubId !== "",
  });
}

export function useCreateMeetingMutation(clubId: string) {
  const client = useApiClient();
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: (body: { meeting_date: string; notes?: string }) =>
      client.POST("/v1/activities/extracurriculars/{clubId}/meetings", {
        params: { path: { clubId } },
        body,
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useMeetingRosterQuery(meetingId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.roster(meetingId),
    queryFn: () =>
      client.GET("/v1/activities/meetings/{meetingId}/roster", {
        params: { path: { meetingId } },
      }),
    enabled: enabled && meetingId !== "",
  });
}

export function useRecordAttendanceMutation(meetingId: string) {
  const client = useApiClient();
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: (body: {
      student_user_id: string;
      status_code: AttendanceStatus;
      notes?: string;
    }) =>
      client.POST("/v1/activities/meetings/{meetingId}/attendance", {
        params: { path: { meetingId } },
        body,
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useClubAttendanceReportQuery(clubId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["activities", "clubs", clubId, "reports", "attendance"] as const,
    queryFn: () =>
      client.GET("/v1/activities/extracurriculars/{clubId}/reports/attendance", {
        params: { path: { clubId } },
      }),
    enabled: clubId !== "",
  });
}

// One-off activities.

export function useActivityEventsQuery(from?: string, to?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.events(from ?? "", to ?? ""),
    queryFn: () => client.GET("/v1/activities/events", { params: { query: { from, to } } }),
  });
}

export function useActivityEventQuery(activityId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.event(activityId),
    queryFn: () =>
      client.GET("/v1/activities/events/{activityId}", { params: { path: { activityId } } }),
    enabled: enabled && activityId !== "",
  });
}

export function useCreateActivityEventMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: (body: ActivityEventWrite) => client.POST("/v1/activities/events", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useUpdateActivityEventMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: ({ id, ...body }: ActivityEventWrite & { id: string }) =>
      client.PUT("/v1/activities/events/{activityId}", {
        params: { path: { activityId: id } },
        body,
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useDeleteActivityEventMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/activities/events/{activityId}", { params: { path: { activityId: id } } }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useAddActivityParticipantMutation(activityId: string) {
  const client = useApiClient();
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: (body: { class_id?: string; grade_level_id?: string; student_user_id?: string }) =>
      client.POST("/v1/activities/events/{activityId}/participants", {
        params: { path: { activityId } },
        body,
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useRemoveActivityParticipantMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: (participantId: string) =>
      client.DELETE("/v1/activities/participants/{participantId}", {
        params: { path: { participantId } },
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

// Achievements.

export function useAchievementsQuery(studentId?: string, classId?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.achievements(studentId ?? "", classId ?? ""),
    queryFn: () =>
      client.GET("/v1/activities/achievements", {
        params: { query: { student_id: studentId, class_id: classId } },
      }),
  });
}

export function useCreateAchievementMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: (body: AchievementWrite) => client.POST("/v1/activities/achievements", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useUpdateAchievementMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: ({ id, ...body }: AchievementWrite & { id: string }) =>
      client.PUT("/v1/activities/achievements/{achievementId}", {
        params: { path: { achievementId: id } },
        body,
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useDeleteAchievementMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateActivities();
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/activities/achievements/{achievementId}", {
        params: { path: { achievementId: id } },
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}
