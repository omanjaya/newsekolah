"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";
import { useActiveYear } from "../../lib/hooks/use-active-year";

export type AdminUser = components["schemas"]["AdminUser"];
export type UserWriteFields = components["schemas"]["UserWriteFields"];
export type ProfileKind = components["schemas"]["ProfileKind"];
export type UserStatus = components["schemas"]["UserStatus"];
export type AdminRole = components["schemas"]["AdminRole"];
export type GradeLevel = components["schemas"]["GradeLevel"];
export type ClassRow = components["schemas"]["Class"];
export type Enrollment = components["schemas"]["Enrollment"];
export type StudentSummary = components["schemas"]["StudentSummary"];
export type Subject = components["schemas"]["Subject"];
export type PeriodTemplate = components["schemas"]["PeriodTemplate"];
export type Period = components["schemas"]["Period"];
export type DutyType = components["schemas"]["DutyType"];
export type DutyAssignment = components["schemas"]["DutyAssignment"];

function useInvalidate(prefix: readonly unknown[]) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: prefix });
  };
}

// Users.

export interface UsersFilter {
  q?: string;
  profile_kind?: ProfileKind;
  status?: UserStatus;
  include_archived?: boolean;
  cursor?: string;
}

export function useUsersQuery(filter: UsersFilter) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.users({ ...filter }),
    queryFn: () =>
      client.GET("/v1/users", {
        params: {
          query: {
            ...(filter.q ? { q: filter.q } : {}),
            ...(filter.profile_kind ? { profile_kind: filter.profile_kind } : {}),
            ...(filter.status ? { status: filter.status } : {}),
            ...(filter.include_archived ? { include_archived: true } : {}),
            ...(filter.cursor ? { cursor: filter.cursor } : {}),
            limit: 50,
          },
        },
      }),
  });
}

export function useUserQuery(id: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.user(id),
    queryFn: () => client.GET("/v1/users/{userId}", { params: { path: { userId: id } } }),
    enabled: id !== "",
  });
}

export function useCreateUserMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(["users"]);
  return useMutation({
    mutationFn: (body: UserWriteFields & { username?: string; password?: string }) =>
      client.POST("/v1/users", { body }),
    onSuccess: invalidate,
  });
}

export function useUpdateUserMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(["users"]);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UserWriteFields }) =>
      client.PUT("/v1/users/{userId}", { params: { path: { userId: id } }, body }),
    onSuccess: invalidate,
  });
}

export function useArchiveUserMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(["users"]);
  return useMutation({
    mutationFn: ({ id, restore }: { id: string; restore: boolean }) =>
      restore
        ? client.POST("/v1/users/{userId}/restore", { params: { path: { userId: id } } })
        : client.POST("/v1/users/{userId}/archive", { params: { path: { userId: id } } }),
    onSuccess: invalidate,
  });
}

export function useResetPasswordMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (id: string) =>
      client.POST("/v1/users/{userId}/reset-password", { params: { path: { userId: id } } }),
  });
}

export function useRolesQuery() {
  const client = useApiClient();
  return useQuery({ queryKey: queryKeys.roles(), queryFn: () => client.GET("/v1/roles") });
}

// Classes and enrollments.

export function useGradeLevelsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["academic", "grade-levels"],
    queryFn: () => client.GET("/v1/academic/grade-levels"),
  });
}

export function useCreateClassMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(["academic", "classes"]);
  return useMutation({
    mutationFn: (body: components["schemas"]["ClassInput"]) =>
      client.POST("/v1/academic/classes", { body }),
    onSuccess: invalidate,
  });
}

export function useUpdateClassMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(["academic", "classes"]);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: components["schemas"]["ClassInput"] }) =>
      client.PUT("/v1/academic/classes/{classId}", { params: { path: { classId: id } }, body }),
    onSuccess: invalidate,
  });
}

export function useEnrollmentsQuery(classId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.enrollments(classId),
    queryFn: () =>
      client.GET("/v1/academic/classes/{classId}/enrollments", {
        params: { path: { classId }, query: { page_size: 200 } },
      }),
    enabled: classId !== "",
  });
}

export function useUnassignedStudentsQuery(search: string, enabled: boolean) {
  const client = useApiClient();
  const year = useActiveYear();
  return useQuery({
    queryKey: queryKeys.unassignedStudents(year.id, search),
    queryFn: () =>
      client.GET("/v1/academic/years/{yearId}/unassigned-students", {
        params: {
          path: { yearId: year.id },
          query: { ...(search ? { search } : {}), page_size: 200 },
        },
      }),
    enabled: enabled && year.id !== "",
  });
}

export function useBulkAssignMutation(classId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: components["schemas"]["BulkAssignInput"]) =>
      client.POST("/v1/academic/classes/{classId}/enrollments/bulk", {
        params: { path: { classId } },
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.enrollments(classId) });
      void queryClient.invalidateQueries({ queryKey: ["academic", "unassigned"] });
    },
  });
}

// Subjects.

export function useCreateSubjectMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(queryKeys.subjects());
  return useMutation({
    mutationFn: (body: components["schemas"]["SubjectInput"]) =>
      client.POST("/v1/academic/subjects", { body }),
    onSuccess: invalidate,
  });
}

export function useUpdateSubjectMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(queryKeys.subjects());
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: components["schemas"]["SubjectInput"] }) =>
      client.PUT("/v1/academic/subjects/{subjectId}", {
        params: { path: { subjectId: id } },
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteSubjectMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(queryKeys.subjects());
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/academic/subjects/{subjectId}", { params: { path: { subjectId: id } } }),
    onSuccess: invalidate,
  });
}

// Periods.

export function usePeriodTemplatesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["academic", "period-templates"],
    queryFn: () => client.GET("/v1/academic/period-templates"),
  });
}

export function useTemplatePeriodsQuery(templateId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["academic", "period-templates", templateId, "periods"],
    queryFn: () =>
      client.GET("/v1/academic/period-templates/{templateId}/periods", {
        params: { path: { templateId } },
      }),
    enabled: templateId !== "",
  });
}

export function useCreatePeriodTemplateMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(["academic"]);
  return useMutation({
    mutationFn: (body: components["schemas"]["PeriodTemplateInput"]) =>
      client.POST("/v1/academic/period-templates", { body }),
    onSuccess: invalidate,
  });
}

export function useCreatePeriodMutation(templateId: string) {
  const client = useApiClient();
  const invalidate = useInvalidate(["academic"]);
  return useMutation({
    mutationFn: (body: components["schemas"]["PeriodInput"]) =>
      client.POST("/v1/academic/period-templates/{templateId}/periods", {
        params: { path: { templateId } },
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdatePeriodMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(["academic"]);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: components["schemas"]["PeriodInput"] }) =>
      client.PUT("/v1/academic/periods/{periodId}", { params: { path: { periodId: id } }, body }),
    onSuccess: invalidate,
  });
}

export function useDeletePeriodMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(["academic"]);
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/academic/periods/{periodId}", { params: { path: { periodId: id } } }),
    onSuccess: invalidate,
  });
}

export function useWeekdayAssignmentsQuery() {
  const client = useApiClient();
  const year = useActiveYear();
  return useQuery({
    queryKey: ["academic", "weekday-assignments", year.id],
    queryFn: () =>
      client.GET("/v1/academic/years/{yearId}/weekday-assignments", {
        params: { path: { yearId: year.id } },
      }),
    enabled: year.id !== "",
  });
}

export function useSetWeekdayMutation() {
  const client = useApiClient();
  const year = useActiveYear();
  const invalidate = useInvalidate(["academic"]);
  return useMutation({
    mutationFn: ({
      day,
      templateId,
      active,
    }: {
      day: number;
      templateId: string;
      active: boolean;
    }) =>
      Promise.all([
        client.PUT("/v1/academic/years/{yearId}/school-days/{dayOfWeek}", {
          params: { path: { yearId: year.id, dayOfWeek: day } },
          body: { is_active: active },
        }),
        ...(active && templateId
          ? [
              client.PUT("/v1/academic/years/{yearId}/weekday-assignments/{dayOfWeek}", {
                params: { path: { yearId: year.id, dayOfWeek: day } },
                body: { template_id: templateId },
              }),
            ]
          : []),
      ]),
    onSuccess: invalidate,
  });
}

// Duties.

export function useDutyTypesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.dutyTypes(),
    queryFn: () => client.GET("/v1/duties"),
  });
}

export function useDutyAssignmentsQuery() {
  const client = useApiClient();
  const year = useActiveYear();
  return useQuery({
    queryKey: queryKeys.dutyAssignments(year.id),
    queryFn: () =>
      client.GET("/v1/duty-assignments", { params: { query: { academic_year_id: year.id } } }),
    enabled: year.id !== "",
  });
}

export function useCreateDutyAssignmentMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(["duties"]);
  return useMutation({
    mutationFn: (body: components["schemas"]["DutyAssignmentWrite"]) =>
      client.POST("/v1/duty-assignments", { body }),
    onSuccess: invalidate,
  });
}

export function useEndDutyAssignmentMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(["duties"]);
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/duty-assignments/{assignmentId}", {
        params: { path: { assignmentId: id } },
      }),
    onSuccess: invalidate,
  });
}

// Teaching assignments.

export function useTeachingAssignmentsQuery(classId?: string) {
  const client = useApiClient();
  const year = useActiveYear();
  return useQuery({
    queryKey: queryKeys.teachingAssignments(year.id, classId),
    queryFn: () =>
      client.GET("/v1/academic/teaching-assignments", {
        params: {
          query: {
            academic_year_id: year.id,
            ...(classId ? { class_id: classId } : {}),
            page_size: 200,
          },
        },
      }),
    enabled: year.id !== "",
  });
}

export function useCreateTeachingAssignmentMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(["academic", "teaching-assignments"]);
  return useMutation({
    mutationFn: (body: components["schemas"]["TeachingAssignmentInput"]) =>
      client.POST("/v1/academic/teaching-assignments", { body }),
    onSuccess: invalidate,
  });
}

export function useDeleteTeachingAssignmentMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(["academic", "teaching-assignments"]);
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/academic/teaching-assignments/{assignmentId}", {
        params: { path: { assignmentId: id } },
      }),
    onSuccess: invalidate,
  });
}
