// A teacher's own class journals and substitution requests/responses.
import { queryKeys } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api/client";
import { useActiveYearId } from "./reference";
import type { JournalWriteRequest, SubstitutionCreateRequest } from "./types";

// Journals: a teacher's own class/subject/day log, independent of the
// per-session journal fields already saved from the attendance editor.

export function useJournals(classId?: string) {
  const yearId = useActiveYearId();
  return useQuery({
    queryKey: queryKeys.journals(yearId, classId),
    queryFn: () =>
      getApiClient().GET("/v1/journals", {
        params: { query: { academic_year_id: yearId, ...(classId ? { class_id: classId } : {}) } },
      }),
    enabled: yearId !== "",
  });
}

export function useUpsertJournal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: JournalWriteRequest) => getApiClient().POST("/v1/journals", { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["journals"] });
    },
  });
}

export function useDeleteJournal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (journalId: string) =>
      getApiClient().DELETE("/v1/journals/{journalId}", { params: { path: { journalId } } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["journals"] });
    },
  });
}

// Substitutions: requesting and responding to a stand-in for one's own
// scheduled occurrence.

export function useSubstitutions(direction: "incoming" | "outgoing") {
  return useQuery({
    queryKey: queryKeys.substitutions(direction),
    queryFn: () => getApiClient().GET("/v1/substitutions", { params: { query: { direction } } }),
  });
}

function useInvalidateSubstitutions() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["substitutions"] });
  };
}

export function useCreateSubstitution() {
  const invalidate = useInvalidateSubstitutions();
  return useMutation({
    mutationFn: (body: SubstitutionCreateRequest) =>
      getApiClient().POST("/v1/substitutions", { body }),
    onSuccess: invalidate,
  });
}

export function useRespondSubstitution() {
  const invalidate = useInvalidateSubstitutions();
  return useMutation({
    mutationFn: ({ id, accept, note }: { id: string; accept: boolean; note?: string }) =>
      getApiClient().POST("/v1/substitutions/{substitutionId}/respond", {
        params: { path: { substitutionId: id } },
        body: { accept, ...(note ? { note } : {}) },
      }),
    onSuccess: invalidate,
  });
}

export function useCancelSubstitution() {
  const invalidate = useInvalidateSubstitutions();
  return useMutation({
    mutationFn: (id: string) =>
      getApiClient().POST("/v1/substitutions/{substitutionId}/cancel", {
        params: { path: { substitutionId: id } },
      }),
    onSuccess: invalidate,
  });
}
