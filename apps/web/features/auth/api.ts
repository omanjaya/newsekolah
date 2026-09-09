"use client";

import { queryKeys } from "@newsekolah/api-client";
import {
  useChangePassword as useChangePasswordBase,
  useLogin as useLoginBase,
  useLogout as useLogoutBase,
} from "@newsekolah/api-client/react";
import type { LoginInput } from "@newsekolah/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { setAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { getPasskey } from "../../lib/webauthn";

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

/**
 * GET /v1/auth/sso/google: whether this tenant has Google sign-in enabled,
 * and the OAuth client id the login screen needs to render the button.
 * Public on purpose (see openapi/modules/identity.yaml) -- called before
 * anyone has signed in.
 */
export function useGoogleSSOAvailabilityQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["auth", "sso", "google", "availability"] as const,
    queryFn: () => client.GET("/v1/auth/sso/google"),
    staleTime: 5 * 60 * 1000,
  });
}

/** POST /v1/auth/sso/google: exchanges a verified Google ID token for a session. */
export function useGoogleLoginMutation() {
  const client = useApiClient();
  const mutation = useMutation({
    mutationFn: (idToken: string) =>
      client.POST("/v1/auth/sso/google", { body: { id_token: idToken, client: "web" } }),
    onSuccess: (data) => {
      setAccessToken(data.access_token);
    },
  });
  return mutation;
}

/**
 * Runs the full passkey sign-in ceremony for one username: fetches
 * request options, hands them to the browser (Touch ID, Windows Hello, a
 * security key, ...), and exchanges the resulting assertion for a
 * session. Kept as one mutation for the same reason as
 * features/security's useRegisterPasskeyMutation: the browser prompt only
 * runs from a user gesture.
 */
export function usePasskeyLoginMutation() {
  const client = useApiClient();
  const mutation = useMutation({
    mutationFn: async (username: string) => {
      const options = await client.POST("/v1/auth/passkeys/login/options", {
        body: { username },
      });
      const credential = await getPasskey(options.public_key);
      return client.POST("/v1/auth/passkeys/login", {
        body: { ceremony_id: options.ceremony_id, credential, client: "web" },
      });
    },
    onSuccess: (data) => {
      setAccessToken(data.access_token);
    },
  });
  return mutation;
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
