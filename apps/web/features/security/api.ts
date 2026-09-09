"use client";

import { type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type MfaStatus = components["schemas"]["MfaStatus"];
export type MfaEnrolment = components["schemas"]["MfaEnrolment"];

/**
 * Query keys local to this feature (not added to the shared
 * `packages/api-client` registry per the task's scope), all under
 * `["security", ...]` so a single prefix invalidates everything below.
 */
const keys = {
  mfaStatus: () => ["security", "mfa", "status"] as const,
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
  });
}

/** POST /v1/me/mfa/confirm: turns a started enrolment into an active one. */
export function useConfirmMfaEnrolmentMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => client.POST("/v1/me/mfa/confirm", { body: { code } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.mfaStatus() });
    },
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
  });
}
