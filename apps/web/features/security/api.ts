"use client";

import { type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";
import { createPasskey } from "../../lib/webauthn";

export type MfaStatus = components["schemas"]["MfaStatus"];
export type MfaEnrolment = components["schemas"]["MfaEnrolment"];
export type Passkey = components["schemas"]["Passkey"];

/**
 * Query keys local to this feature (not added to the shared
 * `packages/api-client` registry per the task's scope), all under
 * `["security", ...]` so a single prefix invalidates everything below.
 */
const keys = {
  mfaStatus: () => ["security", "mfa", "status"] as const,
  passkeys: () => ["security", "passkeys"] as const,
};

/** GET /v1/me/mfa: whether two-factor is enrolled, confirmed, and codes left. */
export function useMfaStatusQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.mfaStatus(),
    queryFn: () => client.GET("/v1/me/mfa"),
  });
}

/**
 * POST /v1/me/mfa/enroll. Returns the secret, `otpauth_url`, and recovery
 * codes for the enrolment dialog; none of it is refetchable afterward, so
 * the caller holds the mutation result in memory only.
 */
export function useStartMfaEnrolmentMutation() {
  const client = useApiClient();
  return useMutation({
    mutationFn: () => client.POST("/v1/me/mfa/enroll"),

    meta: { errorToast: false },
  });
}

/** POST /v1/me/mfa/confirm: turns a started enrolment into an active one. */
// The three mutations below are all driven through MfaCodeForm
// (components/mfa-code-form.tsx), which already catches the mutation's
// error and shows it inline (form.setError("root")), and security-view.tsx
// already toasts its own success message once the confirm handler
// resolves -- errorToast: false avoids a second, generic error toast on
// top of the inline one.

export function useConfirmMfaEnrolmentMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => client.POST("/v1/me/mfa/confirm", { body: { code } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.mfaStatus() });
    },
    meta: { errorToast: false },
  });
}

/** POST /v1/me/mfa/disable: requires a current code, same as regenerating codes. */
export function useDisableMfaMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => client.POST("/v1/me/mfa/disable", { body: { code } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.mfaStatus() });
    },
    meta: { errorToast: false },
  });
}

/** POST /v1/me/mfa/recovery-codes: invalidates the old codes and returns a fresh set. */
export function useRegenerateMfaRecoveryCodesMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => client.POST("/v1/me/mfa/recovery-codes", { body: { code } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.mfaStatus() });
    },
    meta: { errorToast: false },
  });
}

/** GET /v1/me/passkeys. */
export function usePasskeysQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.passkeys(),
    queryFn: async () => (await client.GET("/v1/me/passkeys")).data,
  });
}

/**
 * Runs the full passkey registration ceremony: fetches creation options
 * from the server, hands them to the browser's WebAuthn API, and sends
 * the resulting attestation back with the label the user picked. The
 * browser prompt (Touch ID, Windows Hello, a security key, ...) happens
 * inside `createPasskey` and can only run from a user gesture, which is
 * why this stays one mutation rather than two separate calls the caller
 * has to sequence itself.
 */
export function useRegisterPasskeyMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const options = await client.POST("/v1/me/passkeys/options");
      const credential = await createPasskey(options.public_key);
      return client.POST("/v1/me/passkeys", {
        body: { ceremony_id: options.ceremony_id, credential, name },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.passkeys() });
    },

    meta: { errorToast: false },
  });
}

/** PATCH /v1/me/passkeys/{passkeyId}. */
export function useRenamePasskeyMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ passkeyId, name }: { passkeyId: string; name: string }) =>
      client.PATCH("/v1/me/passkeys/{passkeyId}", {
        params: { path: { passkeyId } },
        body: { name },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.passkeys() });
    },

    meta: { errorToast: false },
  });
}

/** DELETE /v1/me/passkeys/{passkeyId}. */
export function useDeletePasskeyMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (passkeyId: string) =>
      client.DELETE("/v1/me/passkeys/{passkeyId}", { params: { path: { passkeyId } } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.passkeys() });
    },

    meta: { errorToast: false },
  });
}
