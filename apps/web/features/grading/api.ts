"use client";

import { ApiError, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { API_URL } from "../../lib/env";
import { useActiveYear } from "../../lib/hooks/use-active-year";

import { useMyGradesLive } from "./realtime";

export type GradingScale = components["schemas"]["GradingScale"];
export type GradingScaleWrite = components["schemas"]["GradingScaleWrite"];
export type AssessmentComponent = components["schemas"]["AssessmentComponent"];
export type AssessmentComponentKind = components["schemas"]["AssessmentComponentKind"];
export type AssessmentComponentWrite = components["schemas"]["AssessmentComponentWrite"];
export type Gradebook = components["schemas"]["Gradebook"];
export type GradebookStudent = components["schemas"]["GradebookStudent"];
export type ReportScore = components["schemas"]["ReportScore"];
export type GradePublication = components["schemas"]["GradePublication"];
export type GradeRange = components["schemas"]["GradeRange"];
export type MyGrades = components["schemas"]["MyGrades"];
export type MySubjectGrade = components["schemas"]["MySubjectGrade"];
export type MyComponentScore = components["schemas"]["MyComponentScore"];
export type StarEvent = components["schemas"]["StarEvent"];
export type MyStars = components["schemas"]["MyStars"];
export type MyStarGroup = components["schemas"]["MyStarGroup"];
export type EraporFormat = components["schemas"]["EraporFormat"];
export type EraporRow = components["schemas"]["EraporRow"];
export type EraporSkip = components["schemas"]["EraporSkip"];
export type EraporSkipReason = components["schemas"]["EraporSkipReason"];
export type EraporPreview = components["schemas"]["EraporPreview"];
export type TPMapping = components["schemas"]["TPMapping"];
export type TPMappingWrite = components["schemas"]["TPMappingWrite"];

/**
 * Local query keys, kept in this feature per the grading build's scope
 * (packages/api-client/src/query-keys.ts is another agent's file). Every
 * key starts with "grading" so a broad invalidate on that prefix reaches
 * every query below.
 */
export const gradingKeys = {
  scale: () => ["grading", "scale"] as const,
  gradebook: (classId: string, subjectId: string, termId?: string) =>
    ["grading", "gradebook", classId, subjectId, termId ?? ""] as const,
  gradeRanges: () => ["grading", "grade-ranges"] as const,
  myGrades: (termId?: string) => ["grading", "my-grades", termId ?? ""] as const,
  starLedger: (studentId: string) => ["grading", "stars", "ledger", studentId] as const,
  classStarBalances: (classId: string) => ["grading", "stars", "class", classId] as const,
  eraporPreview: (classId: string, termId?: string) =>
    ["grading", "erapor", "preview", classId, termId ?? ""] as const,
  tpMappings: (classId: string, subjectId: string, termId?: string) =>
    ["grading", "tp-mappings", classId, subjectId, termId ?? ""] as const,
};

function useInvalidate(prefix: readonly unknown[]) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: prefix });
  };
}

// Grading scale (manage_settings).

export function useGradingScaleQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: gradingKeys.scale(),
    queryFn: () => client.GET("/v1/grading/scale"),
  });
}

export function useUpdateGradingScaleMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(gradingKeys.scale());
  return useMutation({
    mutationFn: (body: GradingScaleWrite) => client.PUT("/v1/grading/scale", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

// Gradebook.

export interface GradebookFilter {
  classId: string;
  subjectId: string;
  termId?: string;
}

export function useGradebookQuery(filter: GradebookFilter) {
  const client = useApiClient();
  return useQuery({
    queryKey: gradingKeys.gradebook(filter.classId, filter.subjectId, filter.termId),
    queryFn: () =>
      client.GET("/v1/grading/gradebook", {
        params: {
          query: {
            class_id: filter.classId,
            subject_id: filter.subjectId,
            ...(filter.termId ? { term_id: filter.termId } : {}),
          },
        },
      }),
    enabled: filter.classId !== "" && filter.subjectId !== "",
  });
}

function useInvalidateGradebook() {
  return useInvalidate(["grading", "gradebook"]);
}

export function useCreateComponentMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateGradebook();
  return useMutation({
    mutationFn: (body: AssessmentComponentWrite) => client.POST("/v1/grading/components", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useUpdateComponentMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateGradebook();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AssessmentComponentWrite }) =>
      client.PUT("/v1/grading/components/{componentId}", {
        params: { path: { componentId: id } },
        body,
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useDeleteComponentMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateGradebook();
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/grading/components/{componentId}", {
        params: { path: { componentId: id } },
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export interface ScoreEntry {
  student_user_id: string;
  score: number;
}

export function useSaveComponentScoresMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ componentId, entries }: { componentId: string; entries: ScoreEntry[] }) =>
      client.PUT("/v1/grading/components/{componentId}/scores", {
        params: { path: { componentId } },
        body: { entries },
      }),
    onSuccess: (sheet) => {
      queryClient.setQueryData(
        gradingKeys.gradebook(sheet.class_id, sheet.subject_id, sheet.term_id),
        sheet,
      );
    },
  });
}

export function useSetManualReportScoreMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateGradebook();
  return useMutation({
    mutationFn: (body: {
      class_id: string;
      subject_id: string;
      student_user_id: string;
      term_id?: string;
      manual_score?: number | null;
    }) => client.PUT("/v1/grading/report-scores/manual", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useSetGradePublicationMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateGradebook();
  return useMutation({
    mutationFn: (body: {
      class_id: string;
      subject_id: string;
      term_id?: string;
      is_published: boolean;
    }) => client.PUT("/v1/grading/publications", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

// Grade ranges (manage_settings).

export function useGradeRangesQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: gradingKeys.gradeRanges(),
    queryFn: () => client.GET("/v1/grading/grade-ranges"),
  });
}

export interface GradeRangeEntry {
  min_score: number;
  max_score: number;
  increase_amount: number;
}

/**
 * Replaces every range of one subject-teacher scope in a single call: the
 * API validates the whole set together and refuses an overlapping set
 * (GRADE_RANGE_OVERLAP), rather than accepting ranges one at a time.
 */
export function useReplaceGradeRangesMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(gradingKeys.gradeRanges());
  return useMutation({
    mutationFn: (body: {
      subject_id: string;
      teacher_user_id?: string;
      ranges: GradeRangeEntry[];
    }) => client.PUT("/v1/grading/grade-ranges", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

// TP export-code mappings.

export function useTPMappingsQuery(classId: string, subjectId: string, termId?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: gradingKeys.tpMappings(classId, subjectId, termId),
    queryFn: () =>
      client.GET("/v1/grading/tp-mappings", {
        params: {
          query: {
            class_id: classId,
            subject_id: subjectId,
            ...(termId ? { term_id: termId } : {}),
          },
        },
      }),
    enabled: classId !== "" && subjectId !== "",
  });
}

export function useSaveTPMappingMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(["grading", "tp-mappings"]);
  return useMutation({
    mutationFn: (body: TPMappingWrite) => client.POST("/v1/grading/tp-mappings", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useDeleteTPMappingMutation() {
  const client = useApiClient();
  const invalidate = useInvalidate(["grading", "tp-mappings"]);
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/grading/tp-mappings/{mappingId}", { params: { path: { mappingId: id } } }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

// Student's own grades.

export function useMyGradesQuery(termId?: string) {
  const client = useApiClient();
  useMyGradesLive();
  return useQuery({
    queryKey: gradingKeys.myGrades(termId),
    queryFn: () =>
      client.GET("/v1/me/grades", { params: { query: termId ? { term_id: termId } : {} } }),
  });
}

/** The current student's own star total, grouped by subject and teacher. */
export function useMyStarsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["grading", "my-stars"] as const,
    queryFn: () => client.GET("/v1/me/stars"),
  });
}

// Stars.

export function useGiveStarMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      student_user_id: string;
      class_id: string;
      subject_id?: string;
      delta: number;
      note?: string;
      visible_to_student?: boolean;
    }) => client.POST("/v1/grading/stars", { body }),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: gradingKeys.classStarBalances(variables.class_id),
      });
      void queryClient.invalidateQueries({
        queryKey: gradingKeys.starLedger(variables.student_user_id),
      });
    },

    meta: { errorToast: false },
  });
}

export function useStarLedgerQuery(studentId: string, limit?: number) {
  const client = useApiClient();
  return useQuery({
    queryKey: gradingKeys.starLedger(studentId),
    queryFn: () =>
      client.GET("/v1/grading/stars/{studentId}", {
        params: { path: { studentId }, query: limit ? { limit } : {} },
      }),
    enabled: studentId !== "",
  });
}

export function useClassStarBalancesQuery(classId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: gradingKeys.classStarBalances(classId),
    queryFn: () =>
      client.GET("/v1/grading/stars/class/{classId}", { params: { path: { classId } } }),
    enabled: classId !== "",
  });
}

// e-Rapor export.

/** Terms of the active academic year, so the export picker can offer one. */
export function useTermsQuery() {
  const client = useApiClient();
  const year = useActiveYear();
  return useQuery({
    queryKey: ["grading", "terms", year.id] as const,
    queryFn: () =>
      client.GET("/v1/academic/years/{yearId}/terms", { params: { path: { yearId: year.id } } }),
    enabled: year.id !== "",
  });
}

export function useEraporPreviewQuery(classId: string, termId?: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: gradingKeys.eraporPreview(classId, termId),
    queryFn: () =>
      client.GET("/v1/grading/erapor/preview", {
        params: { query: { class_id: classId, ...(termId ? { term_id: termId } : {}) } },
      }),
    enabled: classId !== "",
  });
}

export async function readErrorCode(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "code" in body && typeof body.code === "string") {
      return body.code;
    }
  } catch {
    // Response body was not JSON (or empty); fall through to the generic code.
  }
  return "UNKNOWN";
}

/**
 * Downloads the e-Rapor import file. Uses a direct `fetch` rather than the
 * shared API client: the client parses every response as JSON, but this
 * endpoint returns an XLSX or CSV binary.
 */
export async function downloadEraporExport(
  classId: string,
  termId: string | undefined,
  format: EraporFormat,
): Promise<void> {
  const token = getAccessToken();
  const params = new URLSearchParams({ class_id: classId, format });
  if (termId) params.set("term_id", termId);
  const response = await fetch(`${API_URL}/v1/grading/erapor/export?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    const code = await readErrorCode(response);
    throw new ApiError({ status: response.status, code, message: code });
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `e-rapor.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Downloads the legacy per-subject e-Rapor sheet (No / NIS / Nama / Nilai
 * Rapor / one T|R column per mapped TP export code / Validasi), kept next
 * to the current export for schools whose import tooling still expects it.
 */
export async function downloadEraporExportLegacy(
  classId: string,
  subjectId: string,
  termId: string | undefined,
): Promise<void> {
  const token = getAccessToken();
  const params = new URLSearchParams({ class_id: classId, subject_id: subjectId });
  if (termId) params.set("term_id", termId);
  const response = await fetch(`${API_URL}/v1/grading/erapor/export-legacy?${params.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    const code = await readErrorCode(response);
    throw new ApiError({ status: response.status, code, message: code });
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = "e-rapor-legacy.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
