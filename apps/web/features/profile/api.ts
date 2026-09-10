"use client";

import { queryKeys } from "@newsekolah/api-client";
import {
  useSessions as useSessionsBase,
  useRevokeSession as useRevokeSessionBase,
} from "@newsekolah/api-client/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export function useSessionsQuery() {
  const client = useApiClient();
  return useSessionsBase(client);
}

export function useRevokeSessionMutation() {
  const client = useApiClient();
  return useRevokeSessionBase(client);
}

/** PUT /v1/me/profile: name, email, phone and locale. Returns the fresh `Me`, seeded into the cache. */
export function useUpdateProfileMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; email?: string; phone?: string; locale?: "id" | "en" }) =>
      client.PUT("/v1/me/profile", { body }),
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
