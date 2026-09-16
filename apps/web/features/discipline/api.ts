"use client";

import { type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type ViolationType = components["schemas"]["ViolationType"];
export type ViolationTypeWrite = components["schemas"]["ViolationTypeWrite"];
export type SPLevel = components["schemas"]["SPLevel"];
export type SPPolicy = components["schemas"]["SPPolicy"];
export type ViolationRecord = components["schemas"]["ViolationRecord"];
export type ViolationRecordResult = components["schemas"]["ViolationRecordResult"];
export type PointTotal = components["schemas"]["PointTotal"];
export type WarningLetter = components["schemas"]["WarningLetter"];
export type StudentDiscipline = components["schemas"]["StudentDiscipline"];
export type SPCrossing = components["schemas"]["SPCrossing"];
export type SPCandidate = components["schemas"]["SPCandidate"];
export type CounselingKind = components["schemas"]["CounselingKind"];
export type CounselingTopic = components["schemas"]["CounselingTopic"];
export type CounselingVisibility = components["schemas"]["CounselingVisibility"];
export type CounselingWrite = components["schemas"]["CounselingWrite"];
export type Counseling = components["schemas"]["Counseling"];
export type CounselingAttachment = components["schemas"]["CounselingAttachment"];

/**
 * Query keys local to this feature (not added to the shared
 * `packages/api-client` registry per the task's scope) all under
 * `["discipline", ...]` so a single prefix invalidates everything below.
 */
const keys = {
  violationTypes: (includeInactive: boolean) =>
    ["discipline", "violation-types", includeInactive] as const,
  policy: () => ["discipline", "policy"] as const,
  violations: (params: { classId: string; from: string; to: string; includeVoided: boolean }) =>
    ["discipline", "violations", params] as const,
  studentDiscipline: (studentId: string) => ["discipline", "student", studentId] as const,
  myDiscipline: () => ["discipline", "me"] as const,
  pointTotals: (classId: string) => ["discipline", "point-totals", classId] as const,
  warningLetters: (classId: string) => ["discipline", "warning-letters", classId] as const,
  spCandidates: (params: {
    classId: string;
    level: string;
    search: string;
    limit: number;
    offset: number;
  }) => ["discipline", "sp-candidates", params] as const,
  myCounselings: () => ["discipline", "counselings", "mine"] as const,
  counseling: (id: string) => ["discipline", "counselings", "detail", id] as const,
  counselingAttachments: (id: string) => ["discipline", "counselings", "attachments", id] as const,
  bkTeamCounselings: (topic: string) => ["discipline", "counselings", "bk-team", topic] as const,
};

function useInvalidateDiscipline() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["discipline"] });
}

// Violation catalog.

export function useViolationTypesQuery(includeInactive = false) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.violationTypes(includeInactive),
    queryFn: () =>
      client.GET("/v1/discipline/violation-types", {
        params: { query: { include_inactive: includeInactive } },
      }),
  });
}

export function useCreateViolationTypeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateDiscipline();
  return useMutation({
    mutationFn: (body: ViolationTypeWrite) =>
      client.POST("/v1/discipline/violation-types", { body }),
    onSuccess: invalidate,
  });
}

export function useUpdateViolationTypeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateDiscipline();
  return useMutation({
    mutationFn: ({ id, ...body }: ViolationTypeWrite & { id: string }) =>
      client.PUT("/v1/discipline/violation-types/{typeId}", {
        params: { path: { typeId: id } },
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteViolationTypeMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateDiscipline();
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/discipline/violation-types/{typeId}", {
        params: { path: { typeId: id } },
      }),
    onSuccess: invalidate,
  });
}

// SP ladder policy.

export function useDisciplinePolicyQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.policy(),
    queryFn: () => client.GET("/v1/discipline/policy"),
  });
}

export function useUpdateDisciplinePolicyMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateDiscipline();
  return useMutation({
    mutationFn: (levels: SPLevel[]) => client.PUT("/v1/discipline/policy", { body: { levels } }),
    onSuccess: invalidate,
  });
}

// Violation records (point ledger).

export interface ViolationFilters {
  classId: string;
  from: string;
  to: string;
  includeVoided: boolean;
}

export function useViolationsQuery(filters: ViolationFilters) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.violations(filters),
    queryFn: () =>
      client.GET("/v1/discipline/violations", {
        params: {
          query: {
            class_id: filters.classId || undefined,
            from: filters.from || undefined,
            to: filters.to || undefined,
            include_voided: filters.includeVoided,
            limit: 200,
          },
        },
      }),
  });
}

export function useRecordViolationMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateDiscipline();
  return useMutation({
    mutationFn: (body: {
      student_user_id: string;
      violation_type_ids: string[];
      occurred_on: string;
      notes?: string;
    }) => client.POST("/v1/discipline/violations", { body }),
    onSuccess: invalidate,
  });
}

export function useVoidViolationMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateDiscipline();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      client.POST("/v1/discipline/violations/{recordId}/void", {
        params: { path: { recordId: id } },
        body: { reason },
      }),
    onSuccess: invalidate,
  });
}

export function useStudentDisciplineQuery(studentId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.studentDiscipline(studentId),
    queryFn: () =>
      client.GET("/v1/discipline/students/{studentId}", { params: { path: { studentId } } }),
    enabled: enabled && studentId !== "",
  });
}

/** Short-lived URL for the individual student's discipline PDF report. */
export function useStudentDisciplineReportMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (studentId: string) =>
      client.GET("/v1/discipline/students/{studentId}/report", {
        params: { path: { studentId } },
      }),
  });
}

/** The signed-in student's own points, records, and warning letters. */
export function useMyDisciplineQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.myDiscipline(),
    queryFn: () => client.GET("/v1/me/discipline"),
  });
}

// Point totals and warning letters.

export function usePointTotalsQuery(classId?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.pointTotals(classId ?? ""),
    queryFn: () =>
      client.GET("/v1/discipline/point-totals", {
        params: { query: { class_id: classId, limit: 200 } },
      }),
  });
}

export interface SPCandidateFilters {
  classId: string;
  level: string;
  search: string;
  limit: number;
  offset: number;
}

/**
 * The counselor's warning-letter issuing screen: students whose points
 * reached at least the first level, with the levels already issued so the
 * UI can offer only the next due one (the API refuses skipping levels).
 */
export function useSPCandidatesQuery(filters: SPCandidateFilters) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.spCandidates(filters),
    queryFn: () =>
      client.GET("/v1/discipline/sp-candidates", {
        params: {
          query: {
            class_id: filters.classId || undefined,
            level: filters.level ? Number(filters.level) : undefined,
            search: filters.search || undefined,
            limit: filters.limit,
            offset: filters.offset,
          },
        },
      }),
  });
}

export function useWarningLettersQuery(classId?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.warningLetters(classId ?? ""),
    queryFn: () =>
      client.GET("/v1/discipline/warning-letters", {
        params: { query: { class_id: classId, limit: 100 } },
      }),
  });
}

export function useIssueWarningLetterMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateDiscipline();
  return useMutation({
    mutationFn: (body: { student_user_id: string; level: number }) =>
      client.POST("/v1/discipline/warning-letters", { body }),
    onSuccess: invalidate,
  });
}

export function useWarningLetterDocumentUrlMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (letterId: string) =>
      client.GET("/v1/discipline/warning-letters/{letterId}/document", {
        params: { path: { letterId } },
      }),
  });
}

// Counseling notes (counselor's own).

export function useMyCounselingsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.myCounselings(),
    queryFn: () => client.GET("/v1/discipline/counselings", { params: { query: { limit: 100 } } }),
  });
}

export function useCounselingQuery(id: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.counseling(id),
    queryFn: () =>
      client.GET("/v1/discipline/counselings/{counselingId}", {
        params: { path: { counselingId: id } },
      }),
    enabled: enabled && id !== "",
  });
}

export function useCreateCounselingMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateDiscipline();
  return useMutation({
    mutationFn: (body: CounselingWrite) => client.POST("/v1/discipline/counselings", { body }),
    onSuccess: invalidate,
  });
}

export function useUpdateCounselingMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateDiscipline();
  return useMutation({
    mutationFn: ({ id, ...body }: CounselingWrite & { id: string }) =>
      client.PUT("/v1/discipline/counselings/{counselingId}", {
        params: { path: { counselingId: id } },
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteCounselingMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateDiscipline();
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/discipline/counselings/{counselingId}", {
        params: { path: { counselingId: id } },
      }),
    onSuccess: invalidate,
  });
}

/** Notes any author shared with the whole BK team, optionally filtered by topic. */
export function useBKTeamCounselingsQuery(topic: CounselingTopic | "") {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.bkTeamCounselings(topic),
    queryFn: () =>
      client.GET("/v1/discipline/counselings/bk-team", {
        params: { query: { topic: topic || undefined, limit: 100 } },
      }),
  });
}

/** Short-lived URL for a counseling note's printable A4 report. */
export function useCounselingReportMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (counselingId: string) =>
      client.GET("/v1/discipline/counselings/{counselingId}/report", {
        params: { path: { counselingId } },
      }),
  });
}

// Counseling attachments.

export function useCounselingAttachmentsQuery(counselingId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.counselingAttachments(counselingId),
    queryFn: () =>
      client.GET("/v1/discipline/counselings/{counselingId}/attachments", {
        params: { path: { counselingId } },
      }),
    enabled: enabled && counselingId !== "",
  });
}

export const COUNSELING_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const COUNSELING_ATTACHMENT_TYPES = ["image/jpeg", "image/png"];

/** Uploads straight to object storage through a presigned URL, then confirms it. */
export function useUploadCounselingAttachmentMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ counselingId, file }: { counselingId: string; file: File }) => {
      const grant = await client.POST(
        "/v1/discipline/counselings/{counselingId}/attachments/upload-url",
        { params: { path: { counselingId } } },
      );
      const put = await fetch(grant.upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!put.ok) throw new Error(`upload failed: ${put.status}`);
      return client.POST("/v1/discipline/counselings/{counselingId}/attachments/confirm", {
        params: { path: { counselingId } },
        body: { object_key: grant.object_key },
      });
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: keys.counselingAttachments(variables.counselingId),
      });
    },
  });
}

export function useCounselingAttachmentUrlMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: ({ counselingId, attachmentId }: { counselingId: string; attachmentId: string }) =>
      client.GET("/v1/discipline/counselings/{counselingId}/attachments/{attachmentId}/url", {
        params: { path: { counselingId, attachmentId } },
      }),
  });
}
