"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import {
  useSessions as useSessionsBase,
  useRevokeSession as useRevokeSessionBase,
} from "@newsekolah/api-client/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type UserProfileFields = components["schemas"]["UserProfileFields"];

export function useSessionsQuery() {
  const client = useApiClient();
  return useSessionsBase(client);
}

export function useRevokeSessionMutation() {
  const client = useApiClient();
  return useRevokeSessionBase(client);
}

export interface UpdateProfileInput {
  /** Omit to keep the current username. */
  username?: string;
  name?: string;
  email?: string;
  phone?: string;
  locale?: "id" | "en";
  /** The student/teacher/staff detail record; only sent when the screen edits it. */
  detail?: UserProfileFields;
}

/** PUT /v1/me/profile: username, name, email, phone, locale and the detail record. Returns the fresh `Me`, seeded into the cache. */
export function useUpdateProfileMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProfileInput) => client.PUT("/v1/me/profile", { body }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.me(), data);
    },
  });
}

/** POST /v1/me/avatar/upload-url: a short-lived presigned target for the next PUT. */
export function useRequestAvatarUploadMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: () => client.POST("/v1/me/avatar/upload-url"),
  });
}

/** POST /v1/me/avatar/confirm: validates the uploaded object and sets it as the avatar. */
export function useConfirmAvatarUploadMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (objectKey: string) =>
      client.POST("/v1/me/avatar/confirm", { body: { object_key: objectKey } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    },
  });
}
