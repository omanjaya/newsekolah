"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

import type { CounselingTopic, CounselingWrite } from "./api";

// Counseling notes and their attachments: see api.ts's own top-of-file
// comment (kept out of that file, which is at max-lines).

const keys = {
  myCounselings: () => ["discipline", "counselings", "mine"] as const,
  studentCounselings: (studentId: string) =>
    ["discipline", "counselings", "student", studentId] as const,
  counseling: (id: string) => ["discipline", "counselings", "detail", id] as const,
  counselingAttachments: (id: string) => ["discipline", "counselings", "attachments", id] as const,
  bkTeamCounselings: (topic: string) => ["discipline", "counselings", "bk-team", topic] as const,
};

function useInvalidateDiscipline() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["discipline"] });
}

// Counseling notes (counselor's own).

export function useMyCounselingsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.myCounselings(),
    queryFn: () => client.GET("/v1/discipline/counselings", { params: { query: { limit: 100 } } }),
  });
}

/** Notes about one student the caller is permitted to read (own notes, or shared with the BK team). */
export function useStudentCounselingsQuery(studentId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.studentCounselings(studentId),
    queryFn: () =>
      client.GET("/v1/discipline/students/{studentId}/counselings", {
        params: { path: { studentId } },
      }),
    enabled: enabled && studentId !== "",
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
    meta: { errorToast: false },
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
    meta: { errorToast: false },
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
    meta: { errorToast: false },
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
    meta: { errorToast: false },
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
    meta: { errorToast: false },
  });
}

export function useCounselingAttachmentUrlMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: ({ counselingId, attachmentId }: { counselingId: string; attachmentId: string }) =>
      client.GET("/v1/discipline/counselings/{counselingId}/attachments/{attachmentId}/url", {
        params: { path: { counselingId, attachmentId } },
      }),
    meta: { errorToast: false },
  });
}
