// The caller's own grades/stars/discipline record.
import { useQuery } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api/client";

export function useMyGrades() {
  return useQuery({
    queryKey: ["grades", "me"],
    queryFn: () => getApiClient().GET("/v1/me/grades"),
  });
}

export function useStarLedger(studentId: string) {
  return useQuery({
    queryKey: ["stars", studentId],
    queryFn: () =>
      getApiClient().GET("/v1/grading/stars/{studentId}", {
        params: { path: { studentId }, query: { limit: 50 } },
      }),
    enabled: studentId !== "",
  });
}

/** The caller's own record; students have no discipline permission, so
 * this uses the me-scoped endpoint rather than the staff one. */
export function useMyDiscipline() {
  return useQuery({
    queryKey: ["discipline", "me"],
    queryFn: () => getApiClient().GET("/v1/me/discipline"),
  });
}
