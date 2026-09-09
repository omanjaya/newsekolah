"use client";

import { queryKeys } from "@newsekolah/api-client";
import {
  useChangePassword as useChangePasswordBase,
  useLogin as useLoginBase,
  useLogout as useLogoutBase,
} from "@newsekolah/api-client/react";
import type { LoginInput } from "@newsekolah/schemas";
import { useQueryClient } from "@tanstack/react-query";

import { setAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";

/**
 * Wraps `@newsekolah/api-client/react`'s auth hooks with the side effects
 * specific to the web client: the login/refresh response's access token
 * only ever gets stored in memory (lib/api/access-token.ts), never
 * persisted, and logout always clears it even if the request itself fails
 * (docs/08-security.md section 2).
 */
export function useLoginMutation() {
  const client = useApiClient();
  const mutation = useLoginBase(client, {
    onTokens: (data) => {
      setAccessToken(data.access_token);
    },
  });

  return {
    ...mutation,
    mutateAsync: (input: LoginInput) => mutation.mutateAsync({ ...input, client: "web" }),
  };
}

export function useLogoutMutation() {
  const client = useApiClient();
  const mutation = useLogoutBase(client);

  return {
    ...mutation,
    mutateAsync: async () => {
      try {
        await mutation.mutateAsync();
      } finally {
        setAccessToken(null);
      }
    },
  };
}

export function useChangePasswordMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const mutation = useChangePasswordBase(client);

  return {
    ...mutation,
    mutateAsync: async (body: Parameters<typeof mutation.mutateAsync>[0]) => {
      const result = await mutation.mutateAsync(body);
      // The hook only invalidates `sessions`; `me.must_change_password` also
      // needs a refetch so RouteGuard stops redirecting to /change-password.
      await queryClient.invalidateQueries({ queryKey: queryKeys.me() });
      return result;
    },
  };
}
