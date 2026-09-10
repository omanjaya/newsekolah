"use client";

import { type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type MentorGroup = components["schemas"]["MentorGroup"];
export type MentorGroupWrite = components["schemas"]["MentorGroupWrite"];
export type MentorGroupMember = components["schemas"]["MentorGroupMember"];
export type MentorMeetingNote = components["schemas"]["MentorMeetingNote"];
export type MentorMeetingNoteWrite = components["schemas"]["MentorMeetingNoteWrite"];
export type MentorTermSummary = components["schemas"]["MentorTermSummary"];
export type MentorStudentSnapshot = components["schemas"]["MentorStudentSnapshot"];

/**
 * Query keys local to this feature (not added to the shared
 * `packages/api-client` registry per the task's scope) all under
 * `["mentoring", ...]` so a single prefix invalidates everything below.
 */
const keys = {
  groupSizeLimit: () => ["mentoring", "group-size-limit"] as const,
  groups: () => ["mentoring", "groups"] as const,
  myGroups: () => ["mentoring", "my-groups"] as const,
  group: (groupId: string) => ["mentoring", "group", groupId] as const,
  members: (groupId: string) => ["mentoring", "members", groupId] as const,
  notes: (groupId: string) => ["mentoring", "notes", groupId] as const,
  note: (noteId: string) => ["mentoring", "note", noteId] as const,
  snapshot: (studentId: string) => ["mentoring", "snapshot", studentId] as const,
  termSummary: (groupId: string, termId: string, studentId: string) =>
    ["mentoring", "term-summary", groupId, termId, studentId] as const,
};

function useInvalidateMentoring() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["mentoring"] });
}

// Group-size limit.

export function useGroupSizeLimitQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.groupSizeLimit(),
    queryFn: () => client.GET("/v1/mentoring/settings/group-size-limit"),
  });
}

export function useSetGroupSizeLimitMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateMentoring();
  return useMutation({
    mutationFn: (limit: number) =>
      client.PUT("/v1/mentoring/settings/group-size-limit", { body: { limit } }),
    onSuccess: invalidate,
  });
}

// Groups.

export function useMentorGroupsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.groups(),
    queryFn: () => client.GET("/v1/mentoring/groups"),
  });
}

export function useMyMentorGroupsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.myGroups(),
    queryFn: () => client.GET("/v1/mentoring/my-groups"),
  });
}

export function useMentorGroupQuery(groupId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.group(groupId),
    queryFn: () => client.GET("/v1/mentoring/groups/{groupId}", { params: { path: { groupId } } }),
    enabled: enabled && groupId !== "",
  });
}

export function useCreateMentorGroupMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateMentoring();
  return useMutation({
    mutationFn: (body: MentorGroupWrite) => client.POST("/v1/mentoring/groups", { body }),
    onSuccess: invalidate,
  });
}

export function useUpdateMentorGroupMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateMentoring();
  return useMutation({
    mutationFn: ({ groupId, ...body }: MentorGroupWrite & { groupId: string }) =>
      client.PUT("/v1/mentoring/groups/{groupId}", { params: { path: { groupId } }, body }),
    onSuccess: invalidate,
  });
}

export function useDeleteMentorGroupMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateMentoring();
  return useMutation({
    mutationFn: (groupId: string) =>
      client.DELETE("/v1/mentoring/groups/{groupId}", { params: { path: { groupId } } }),
    onSuccess: invalidate,
  });
}

// Members.

export function useMentorGroupMembersQuery(groupId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.members(groupId),
    queryFn: () =>
      client.GET("/v1/mentoring/groups/{groupId}/members", { params: { path: { groupId } } }),
    enabled: enabled && groupId !== "",
  });
}

export function useAssignMentorGroupMemberMutation(groupId: string) {
  const client = useApiClient();
  const invalidate = useInvalidateMentoring();
  return useMutation({
    mutationFn: (studentUserId: string) =>
      client.POST("/v1/mentoring/groups/{groupId}/members", {
        params: { path: { groupId } },
        body: { student_user_id: studentUserId },
      }),
    onSuccess: invalidate,
  });
}

export function useRemoveMentorGroupMemberMutation(groupId: string) {
  const client = useApiClient();
  const invalidate = useInvalidateMentoring();
  return useMutation({
    mutationFn: (studentId: string) =>
      client.DELETE("/v1/mentoring/groups/{groupId}/members/{studentId}", {
        params: { path: { groupId, studentId } },
      }),
    onSuccess: invalidate,
  });
}

// Meeting notes. Sealed at rest on the server; kept out of page titles,
// toasts, and URLs on this side too (only the opaque note id ever appears
// in a URL).

export function useMentorMeetingNotesQuery(groupId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.notes(groupId),
    queryFn: () =>
      client.GET("/v1/mentoring/groups/{groupId}/notes", { params: { path: { groupId } } }),
    enabled: enabled && groupId !== "",
  });
}

export function useMentorMeetingNoteQuery(noteId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.note(noteId),
    queryFn: () => client.GET("/v1/mentoring/notes/{noteId}", { params: { path: { noteId } } }),
    enabled: enabled && noteId !== "",
  });
}

export function useCreateMentorMeetingNoteMutation(groupId: string) {
  const client = useApiClient();
  const invalidate = useInvalidateMentoring();
  return useMutation({
    mutationFn: (body: MentorMeetingNoteWrite) =>
      client.POST("/v1/mentoring/groups/{groupId}/notes", {
        params: { path: { groupId } },
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateMentorMeetingNoteMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateMentoring();
  return useMutation({
    mutationFn: ({ noteId, ...body }: MentorMeetingNoteWrite & { noteId: string }) =>
      client.PUT("/v1/mentoring/notes/{noteId}", { params: { path: { noteId } }, body }),
    onSuccess: invalidate,
  });
}

export function useDeleteMentorMeetingNoteMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateMentoring();
  return useMutation({
    mutationFn: (noteId: string) =>
      client.DELETE("/v1/mentoring/notes/{noteId}", { params: { path: { noteId } } }),
    onSuccess: invalidate,
  });
}

// Per-student view and term summary.

export function useMentorStudentSnapshotQuery(studentId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.snapshot(studentId),
    queryFn: () =>
      client.GET("/v1/mentoring/students/{studentId}/snapshot", {
        params: { path: { studentId } },
      }),
    enabled: enabled && studentId !== "",
  });
}

export function useMentorTermSummaryQuery(
  groupId: string,
  termId: string,
  studentId: string,
  enabled = true,
) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.termSummary(groupId, termId, studentId),
    queryFn: () =>
      client.GET("/v1/mentoring/groups/{groupId}/term-summaries/{termId}/{studentId}", {
        params: { path: { groupId, termId, studentId } },
      }),
    enabled: enabled && groupId !== "" && termId !== "" && studentId !== "",
  });
}

export function useWriteMentorTermSummaryMutation(
  groupId: string,
  termId: string,
  studentId: string,
) {
  const client = useApiClient();
  const invalidate = useInvalidateMentoring();
  return useMutation({
    mutationFn: (summary: string) =>
      client.PUT("/v1/mentoring/groups/{groupId}/term-summaries/{termId}/{studentId}", {
        params: { path: { groupId, termId, studentId } },
        body: { summary },
      }),
    onSuccess: invalidate,
  });
}
