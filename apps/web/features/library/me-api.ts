"use client";

import type { components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type LibraryMyProfile = components["schemas"]["LibraryMyProfile"];

function useInvalidateMyProfile() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["library", "me"] });
}

/** The current user's own library profile: active loans, history, reservations, and fines. */
export function useMyLibraryProfileQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: ["library", "me"],
    queryFn: () => client.GET("/v1/library/me"),
  });
}

/** Renews one of the current user's own active loans, so a member does not need to ask a librarian for a routine renewal. */
export function useRenewMyLoanMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateMyProfile();
  return useMutation({
    mutationFn: (loanId: string) =>
      client.POST("/v1/library/me/loans/{loanId}/renew", { params: { path: { loanId } } }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

/** Reserves a title for the current user, so a member can hold a book without asking a librarian. */
export function useReserveMyLibraryTitleMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateMyProfile();
  return useMutation({
    mutationFn: (titleId: string) =>
      client.POST("/v1/library/me/reservations", { body: { title_id: titleId } }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useCancelMyLibraryReservationMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateMyProfile();
  return useMutation({
    mutationFn: (reservationId: string) =>
      client.POST("/v1/library/me/reservations/{reservationId}/cancel", {
        params: { path: { reservationId } },
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}
