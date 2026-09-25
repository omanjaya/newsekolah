// The caller's own grades/stars/discipline record.
import { useQuery } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api/client";
import { useLiveInvalidate } from "@/lib/realtime";

/**
 * `grading.published` -> `user:<tenant>:<student>`
 * (docs/analysis/realtime-plan-2026-09-25.md section 4.4 row 17): the
 * student's own grades screen (app/grades.tsx), which had no live signal
 * at all before. The base user topic is auto-subscribed on every /ws/me
 * connection, so no useLiveTopic call is needed here.
 */
export function useMyGrades() {
  useLiveInvalidate(["grading.published"], [["grades", "me"]]);
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
