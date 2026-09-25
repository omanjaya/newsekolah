"use client";

import { type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type ViolationAttachment = components["schemas"]["ViolationAttachment"];
export type PointsPreviewEntry = components["schemas"]["PointsPreviewEntry"];

const keys = {
  pointsPreview: (studentIds: string[]) =>
    ["discipline", "points-preview", [...studentIds].sort()] as const,
  violationAttachments: (recordId: string) =>
    ["discipline", "violations", "attachments", recordId] as const,
};

/**
 * Live points preview while a teacher is still choosing violation types
 * for one or several students: current active total and already-issued SP
 * levels per student, plus the tenant's SP policy, in one round trip. The
 * points about to be added are already known client-side (each violation
 * type's points come from the catalog `useViolationTypesQuery` already
 * fetched), so the caller adds those itself -- see
 * `lib/points-preview.ts`'s `computePointsPreview`, which mirrors the
 * server's `SPPolicy.DueLevels` the same way `computeLiveAverage` mirrors
 * `WeightedAverage`.
 */
export function usePointsPreviewQuery(studentIds: string[]) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.pointsPreview(studentIds),
    queryFn: () =>
      client.POST("/v1/discipline/points-preview", {
        body: { student_user_ids: studentIds },
      }),
    enabled: studentIds.length > 0,
  });
}

// Violation photo evidence (feature: optional 1-3 photos per record).

export const VIOLATION_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const VIOLATION_ATTACHMENT_TYPES = ["image/jpeg", "image/png"];
export const VIOLATION_ATTACHMENT_MAX_COUNT = 3;

export function useViolationAttachmentsQuery(recordId: string, enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.violationAttachments(recordId),
    queryFn: () =>
      client.GET("/v1/discipline/violations/{recordId}/attachments", {
        params: { path: { recordId } },
      }),
    enabled: enabled && recordId !== "",
  });
}

/** Uploads straight to object storage through a presigned URL, then confirms it. */
export function useUploadViolationAttachmentMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ recordId, file }: { recordId: string; file: File }) => {
      const grant = await client.POST(
        "/v1/discipline/violations/{recordId}/attachments/upload-url",
        { params: { path: { recordId } } },
      );
      const put = await fetch(grant.upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!put.ok) throw new Error(`upload failed: ${put.status}`);
      return client.POST("/v1/discipline/violations/{recordId}/attachments/confirm", {
        params: { path: { recordId } },
        body: { object_key: grant.object_key },
      });
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: keys.violationAttachments(variables.recordId),
      });
    },

    meta: { errorToast: false },
  });
}

export function useViolationAttachmentUrlMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: ({ recordId, attachmentId }: { recordId: string; attachmentId: string }) =>
      client.GET("/v1/discipline/violations/{recordId}/attachments/{attachmentId}/url", {
        params: { path: { recordId, attachmentId } },
      }),

    meta: { errorToast: false },
  });
}
