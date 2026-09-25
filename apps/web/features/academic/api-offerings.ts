"use client";

import { type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type SubjectOffering = components["schemas"]["SubjectOffering"];
export type SubjectOfferingInput = components["schemas"]["SubjectOfferingInput"];
export type SubjectOfferingUpdateInput = components["schemas"]["SubjectOfferingUpdateInput"];
export type TeachingAssignment = components["schemas"]["TeachingAssignment"];
export type SubjectClassPair = components["schemas"]["SubjectClassPair"];
export type ClassRow = components["schemas"]["Class"];

// Subject offerings, scoped to one academic year.

const OFFERINGS_KEY = (yearId: string) =>
  ["academic", "years", yearId, "subject-offerings"] as const;

export function useSubjectOfferingsQuery(yearId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: OFFERINGS_KEY(yearId),
    queryFn: () =>
      client.GET("/v1/academic/years/{yearId}/subject-offerings", {
        params: { path: { yearId } },
      }),
    enabled: yearId !== "",
  });
}

function useInvalidateOfferings(yearId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: OFFERINGS_KEY(yearId) });
}

export function useCreateSubjectOfferingMutation(yearId: string) {
  const client = useApiClient();
  const invalidate = useInvalidateOfferings(yearId);
  return useMutation({
    mutationFn: (body: SubjectOfferingInput) =>
      client.POST("/v1/academic/years/{yearId}/subject-offerings", {
        params: { path: { yearId } },
        body,
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useUpdateSubjectOfferingMutation(yearId: string) {
  const client = useApiClient();
  const invalidate = useInvalidateOfferings(yearId);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SubjectOfferingUpdateInput }) =>
      client.PUT("/v1/academic/subject-offerings/{offeringId}", {
        params: { path: { offeringId: id } },
        body,
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useDeleteSubjectOfferingMutation(yearId: string) {
  const client = useApiClient();
  const invalidate = useInvalidateOfferings(yearId);
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/academic/subject-offerings/{offeringId}", {
        params: { path: { offeringId: id } },
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

// Classes of an arbitrary academic year (the active-year version lives in
// features/reference/api.ts; teaching assignments and subject offerings are
// managed across years, so this fetches whichever year id the screen picks).

export function useClassesForYearQuery(yearId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["academic", "years", yearId, "classes"],
    queryFn: () =>
      client.GET("/v1/academic/classes", {
        params: { query: { academic_year_id: yearId, page_size: 200 } },
      }),
    enabled: yearId !== "",
  });
}

// Teaching assignments: a teacher's full (subject, class) roster for one
// academic year, replaced wholesale through the sync endpoint rather than
// added and removed one row at a time.

export function useTeachingAssignmentsForTeacherQuery(yearId: string, teacherUserId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["academic", "years", yearId, "teaching-assignments", teacherUserId],
    queryFn: () =>
      client.GET("/v1/academic/teaching-assignments", {
        params: {
          query: {
            academic_year_id: yearId,
            teacher_user_id: teacherUserId,
            page_size: 200,
          },
        },
      }),
    enabled: yearId !== "" && teacherUserId !== "",
  });
}

export function useSyncTeacherAssignmentsMutation(yearId: string, teacherUserId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pairs: SubjectClassPair[]) =>
      client.POST("/v1/academic/teaching-assignments/sync", {
        body: { academic_year_id: yearId, teacher_user_id: teacherUserId, pairs },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["academic", "years", yearId, "teaching-assignments", teacherUserId],
      });
    },

    meta: { errorToast: false },
  });
}
