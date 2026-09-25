// Librarian's own slice: catalogue search, circulation (borrow/return),
// member loan lookup, overdue loans, and stocktake (opname) sessions. Kept
// separate from staff.ts since it is one role's own module, not a general
// staff tool. Query keys are local (["library", ...]) rather than
// @newsekolah/api-client's shared queryKeys -- this module owns every
// library query, so nothing else needs to invalidate by the same key.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api/client";

const LIBRARY_KEY = ["library"] as const;

function useInvalidateLibrary() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: LIBRARY_KEY });
  };
}

export function useLibraryTitles(search: string) {
  return useQuery({
    queryKey: [...LIBRARY_KEY, "titles", search],
    queryFn: () =>
      getApiClient().GET("/v1/library/titles", {
        params: { query: { search: search || undefined, limit: 20 } },
      }),
  });
}

export function useLibraryTitle(titleId: string) {
  return useQuery({
    queryKey: [...LIBRARY_KEY, "title", titleId],
    queryFn: () =>
      getApiClient().GET("/v1/library/titles/{titleId}", { params: { path: { titleId } } }),
    enabled: titleId !== "",
    staleTime: 5 * 60_000,
  });
}

/** One title's physical copies, used to resolve a specific copy's barcode
 * before confirming a return by scan (see app/library/member/[userId].tsx). */
export function useResolveCopyBarcode() {
  return useMutation({
    mutationFn: async ({ titleId, copyId }: { titleId: string; copyId: string }) => {
      const result = await getApiClient().GET("/v1/library/titles/{titleId}/copies", {
        params: { path: { titleId } },
      });
      const copy = result.data.find((c) => c.id === copyId);
      if (!copy) throw new Error("copy not found for this loan");
      return copy.barcode;
    },
  });
}

export function useBorrowLoan() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (body: { barcode: string; member_user_id: string }) =>
      getApiClient().POST("/v1/library/loans/borrow", { body }),
    onSuccess: invalidate,
    // features/scan/library-scan.ts's useLibraryScanHandler already maps
    // known failure codes (unknown barcode, copy unavailable, loan limit)
    // to a specific message -- more useful than the mutation cache's
    // generic default, so this opts out to avoid showing both.
    meta: { errorToast: false },
  });
}

export function useReturnLoan() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: ({ id, condition }: { id: string; condition?: "good" | "fair" | "damaged" }) =>
      getApiClient().POST("/v1/library/loans/{loanId}/return", {
        params: { path: { loanId: id } },
        body: condition ? { condition } : {},
      }),
    onSuccess: invalidate,
    meta: { errorToast: false }, // see useBorrowLoan's comment
  });
}

export function useOverdueLoans(enabled: boolean) {
  return useQuery({
    queryKey: [...LIBRARY_KEY, "overdue"],
    queryFn: () => getApiClient().GET("/v1/library/loans/overdue"),
    enabled,
  });
}

export function useMemberLoans(userId: string, includeReturned: boolean) {
  return useQuery({
    queryKey: [...LIBRARY_KEY, "member-loans", userId, includeReturned],
    queryFn: () =>
      getApiClient().GET("/v1/library/members/{userId}/loans", {
        params: { path: { userId }, query: { include_returned: includeReturned, limit: 50 } },
      }),
    enabled: userId !== "",
  });
}

export function useLibraryStocktakes() {
  return useQuery({
    queryKey: [...LIBRARY_KEY, "stocktakes"],
    queryFn: () =>
      getApiClient().GET("/v1/library/stocktakes", { params: { query: { limit: 20 } } }),
  });
}

export function useStocktake(stocktakeId: string) {
  return useQuery({
    queryKey: [...LIBRARY_KEY, "stocktake", stocktakeId],
    queryFn: () =>
      getApiClient().GET("/v1/library/stocktakes/{stocktakeId}", {
        params: { path: { stocktakeId } },
      }),
    enabled: stocktakeId !== "",
  });
}

export function useStartStocktake() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (body: { name: string; notes?: string }) =>
      getApiClient().POST("/v1/library/stocktakes", { body }),
    onSuccess: invalidate,
  });
}

export function useCloseStocktake() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      getApiClient().POST("/v1/library/stocktakes/{stocktakeId}/close", {
        params: { path: { stocktakeId: id } },
        body: notes ? { notes } : {},
      }),
    onSuccess: invalidate,
  });
}
