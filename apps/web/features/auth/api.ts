"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import {
  useChangePassword as useChangePasswordBase,
  useLogin as useLoginBase,
  useLogout as useLogoutBase,
  useStartSession,
} from "@newsekolah/api-client/react";
import type { LoginInput } from "@newsekolah/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { setAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { clearServerAccessCookie } from "../../lib/session/clear-server-access-cookie";
import { useEndSession, useForgetSession } from "../../lib/session/end-session";
import { clearSimulation } from "../../lib/simulation/clock";
import { getPasskey } from "../../lib/webauthn";

/** What a sign-in hands this tab: the new access token, and no simulated clock left from before. */
function storeSessionTokens(data: components["schemas"]["AuthTokens"]): void {
  clearSimulation();
  setAccessToken(data.access_token);
}

/**
 * Wraps `@newsekolah/api-client/react`'s auth hooks with the side effects
 * specific to the web client: the login/refresh response's access token
 * only ever gets stored in memory (lib/api/access-token.ts), never
 * persisted, and logout always clears it even if the request itself fails
 * (docs/08-security.md section 2).
 *
 * Every sign-in (password here, Google and passkey below) does the same
 * three things: removes the server access cookie right before the request
 * that creates the session, so the first server render after it cannot
 * load the previous account's `/v1/me` (a sign-in that cannot remove it
 * fails before any session exists); hands the tokens to
 * `storeSessionTokens`; and goes through the package's `useStartSession`
 * (`useLogin` uses it too), which first drops any refresh still on its way
 * for the previous identity, then empties the cache but for the tenant's
 * branding and seeds `me` from the response.
 */
export function useLoginMutation() {
  const client = useApiClient();
  const mutation = useLoginBase(client, {
    beforeRequest: clearServerAccessCookie,
    onTokens: storeSessionTokens,
    // login-form.tsx already shows a failure inline (form.setError("root")).
    meta: { errorToast: false },
  });

  return {
    ...mutation,
    mutateAsync: (input: LoginInput) => mutation.mutateAsync({ ...input, client: "web" }),
  };
}

/**
 * POST /v1/auth/impersonation/stop. The server revokes the impersonation
 * session; there is no admin session to go back to (starting the
 * impersonation replaced it), so a stop the server confirmed ends like a
 * sign-out: the server access cookie is removed, then `useEndSession`
 * drops the tokens (the API client's remembered one too, which may still
 * be the admin's own and valid) and the cache, and the caller sends the
 * admin to sign in. The cookie by then names at most the revoked session,
 * since the start removed the admin's, so failing to remove it does not
 * stop the sign-out; the next sign-in removes it again before it starts.
 *
 * A stop that failed changes nothing here. The impersonation session is
 * still alive on the server and the browser still holds its refresh
 * cookie, so the tab really is still impersonating: it keeps its token,
 * its data and the strip that says so (components/impersonation-banner.tsx),
 * which shows the error and lets the admin try again. Clearing anything
 * would not end that session; it only hid the strip while the session
 * went on.
 */
export function useStopImpersonationMutation() {
  const client = useApiClient();
  const endSession = useEndSession();
  return useMutation({
    mutationFn: async () => {
      await client.POST("/v1/auth/impersonation/stop");
      await clearServerAccessCookie().catch(() => undefined);
    },
    onSuccess: endSession,
    // The strip shows the failure itself.
    meta: { errorToast: false },
  });
}

/**
 * POST /v1/auth/logout. The package hook empties the cache once the server
 * ended the session; this drops the tokens and the simulated clock either
 * way (useForgetSession).
 */
export function useLogoutMutation() {
  const client = useApiClient();
  const mutation = useLogoutBase(client);
  const forgetSession = useForgetSession();

  return {
    ...mutation,
    mutateAsync: async () => {
      try {
        await mutation.mutateAsync();
      } finally {
        forgetSession();
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
  const startSession = useStartSession(client, { onTokens: storeSessionTokens });
  const mutation = useMutation({
    mutationFn: async (idToken: string) => {
      await clearServerAccessCookie();
      return client.POST("/v1/auth/sso/google", { body: { id_token: idToken, client: "web" } });
    },
    onSuccess: startSession,
    // google-sign-in-button.tsx's onError prop shows a failure inline.
    meta: { errorToast: false },
  });
  return mutation;
}

/**
 * Runs the full passkey sign-in ceremony for one username: fetches
 * request options, hands them to the browser (Touch ID, Windows Hello, a
 * security key, ...), and exchanges the resulting assertion for a
 * session. Kept as one mutation for the same reason as
 * features/security's useRegisterPasskeyMutation: the browser prompt only
 * runs from a user gesture. The server access cookie is removed after the
 * prompt, so the prompt still follows the press as closely as before.
 */
export function usePasskeyLoginMutation() {
  const client = useApiClient();
  const startSession = useStartSession(client, { onTokens: storeSessionTokens });
  const mutation = useMutation({
    mutationFn: async (username: string) => {
      const options = await client.POST("/v1/auth/passkeys/login/options", {
        body: { username },
      });
      const credential = await getPasskey(options.public_key);
      await clearServerAccessCookie();
      return client.POST("/v1/auth/passkeys/login", {
        body: { ceremony_id: options.ceremony_id, credential, client: "web" },
      });
    },
    onSuccess: startSession,
    // passkey-login-button.tsx's onError prop shows a failure inline.
    meta: { errorToast: false },
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
    // forgot-password-form.tsx shows a failure inline (form.setError("root")).
    meta: { errorToast: false },
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
    // reset-password-form.tsx shows a failure inline (form.setError("root")).
    meta: { errorToast: false },
  });
}

export function useChangePasswordMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  // change-password-form.tsx shows a failure inline (form.setError("root"))
  // and already toasts its own success -- opt out to avoid a second,
  // generic error toast on top of the inline one.
  const mutation = useChangePasswordBase(client, { meta: { errorToast: false } });

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
