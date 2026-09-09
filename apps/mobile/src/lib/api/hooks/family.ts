// The caller's own grades/stars/discipline record, and a parent's view of
// each linked child's.
import { useQuery } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api/client";
import { REFERENCE_STALE_MS } from "./types";

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

// Parent: linked children and their per-child records.

export function useMyChildren() {
  return useQuery({
    queryKey: ["children"],
    queryFn: () => getApiClient().GET("/v1/me/children"),
    staleTime: REFERENCE_STALE_MS,
  });
}

export function useChildAttendance(studentId: string, month: string) {
  return useQuery({
    queryKey: ["children", studentId, "attendance", month],
    queryFn: () =>
      getApiClient().GET("/v1/children/{studentId}/attendance", {
        params: { path: { studentId }, query: { month } },
      }),
    enabled: studentId !== "" && month !== "",
  });
}

export function useChildGrades(studentId: string) {
  return useQuery({
    queryKey: ["children", studentId, "grades"],
    queryFn: () =>
      getApiClient().GET("/v1/children/{studentId}/grades", {
        params: { path: { studentId } },
      }),
    enabled: studentId !== "",
  });
}

export function useChildDiscipline(studentId: string) {
  return useQuery({
    queryKey: ["children", studentId, "discipline"],
    queryFn: () =>
      getApiClient().GET("/v1/children/{studentId}/discipline", {
        params: { path: { studentId } },
      }),
    enabled: studentId !== "",
  });
}
