"use client";

import { ApiError, queryKeys, type components } from "@newsekolah/api-client";
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
import { retireServerAccessCookie } from "../../lib/session/clear-server-access-cookie";
import { useEndSession, useForgetSession } from "../../lib/session/end-session";
import { switchReader } from "../../lib/session/switch-reader";
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
 * three things: sets aside the server access cookie right before the
 * request that creates the session, so the first server render after it
 * cannot load the previous account's `/v1/me` (`retireServerAccessCookie`:
 * removed, or marked stale when the route fails or does not answer in
 * time, so it can never keep anyone from signing in); hands the tokens to
 * `storeSessionTokens`; and goes through the package's `useStartSession`
 * (`useLogin` uses it too), which first drops any refresh still on its way
 * for the previous identity, then empties the cache but for the tenant's
 * branding and seeds `me` from the response.
 */
export function useLoginMutation() {
  const client = useApiClient();
  const mutation = useLoginBase(client, {
    beforeRequest: retireServerAccessCookie,
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
 * Whether the API refused a stop because the impersonation is already
 * over, so that finishing it in this tab is all that is left to do:
 * - any 401. The stop needs only an authenticated session, and the auth
 *   middleware answers 401 when there is no live session behind the
 *   token: AUTH_SESSION_REVOKED once the impersonation reached its fixed
 *   end or another tab stopped it (platform/auth/middleware.go,
 *   `!active`), AUTH_TOKEN_INVALID for a token it cannot use
 *   (platform/authz/identity.go). AUTH_TOKEN_EXPIRED reaches this far only
 *   after the client's own refresh failed as well, and is also what the
 *   handler answers when the session row is gone (StopImpersonation's
 *   ErrSessionNotFound, mapped by mapAuthError).
 * - 400 NOT_IMPERSONATING. The token names a session that is not an
 *   impersonation (service/impersonation.go): this tab refreshed into a
 *   sign-in made in another tab, so the impersonation it shows is gone.
 * A network error, a 5xx or a 429 says nothing about the session: not
 * over, and the stop can be tried again.
 */
function isImpersonationOver(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 401 || (error.status === 400 && error.code === "NOT_IMPERSONATING"))
  );
}

/** How a stop ended: back in the admin's own session, or signed out. */
export type ImpersonationStopOutcome = "restored" | "ended";

/**
 * POST /v1/auth/impersonation/stop.
 *
 * An impersonation started from the web parks the admin's own login on the
 * server (the continuation cookie, as role testing does), so the server
 * answers the stop with the admin's restored tokens: they go through
 * `switchReader`, like the start did, and the caller takes the admin to
 * their dashboard ("restored"). The server access cookie, which named the
 * impersonated account, is set aside first so a reload cannot render it
 * over the admin; `retireServerAccessCookie` never keeps the stop from
 * finishing.
 *
 * With nothing to restore (a 204: an impersonation started before the
 * continuation existed, or one that outlived it), a confirmed stop ends
 * like a sign-out: `useEndSession` drops the tokens (the API client's
 * remembered one too) and the cache, and the caller sends the admin to
 * sign in ("ended"). A stop the server refused because the impersonation
 * is already over (see `isImpersonationOver`) ends the same way: there is
 * nothing left to stop, and keeping the strip would leave a Stop that can
 * never succeed over screens that all get 401.
 *
 * Any other failed stop changes nothing here. The impersonation session
 * is still alive on the server and the browser still holds its refresh
 * cookie, so the tab really is still impersonating: it keeps its token,
 * its data and the strip that says so (components/impersonation-banner.tsx),
 * which shows the error and lets the admin try again.
 */
export function useStopImpersonationMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const endSession = useEndSession();
  return useMutation({
    mutationFn: async (): Promise<ImpersonationStopOutcome> => {
      let restored: components["schemas"]["AuthTokens"] | undefined;
      try {
        restored = await client.POST("/v1/auth/impersonation/stop");
      } catch (error) {
        if (!isImpersonationOver(error)) throw error;
      }
      await retireServerAccessCookie();
      if (restored) {
        await switchReader(queryClient, client, restored);
        return "restored";
      }
      return "ended";
    },
    onSuccess: (outcome) => {
      if (outcome === "ended") endSession();
    },
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
      await retireServerAccessCookie();
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
 * runs from a user gesture. The server access cookie is set aside after
 * the prompt, so the prompt still follows the press as closely as before.
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
      await retireServerAccessCookie();
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
