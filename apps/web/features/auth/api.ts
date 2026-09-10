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

/**
 * POST /v1/auth/impersonation/stop. The impersonation session is revoked
 * server-side (not swapped back to the admin's own session -- there is
 * none to swap to, since starting impersonation opened a brand new
 * session), so this always ends in a normal logout: clear the token and
 * let the caller send the admin back to sign in.
 */
export function useStopImpersonationMutation() {
  const client = useApiClient();
  const mutation = useMutation({
    mutationFn: () => client.POST("/v1/auth/impersonation/stop"),
  });

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

/**
 * POST /v1/auth/password-reset/request. Always resolves to 202 whether or
 * not the address exists (see the endpoint doc comment in the OpenAPI
 * contract), so the caller must show the same generic message either way
 * and only ever surface a genuine client-side failure (network, rate limit).
 */
export function useRequestPasswordResetMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (usernameOrEmail: string) =>
      client.POST("/v1/auth/password-reset/request", {
        body: { username_or_email: usernameOrEmail },
      }),
  });
}

/**
 * POST /v1/auth/password-reset/confirm. Accepts both a self-service reset
 * token and an admin-issued set-password token (see
 * features/school/components/users-view.tsx's reset-password link), so this
 * one mutation backs both the forgot-password flow and that admin flow.
 */
export function useConfirmPasswordResetMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: (body: { token: string; new_password: string }) =>
      client.POST("/v1/auth/password-reset/confirm", { body }),
  });
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
