"use client";

import { type components } from "@newsekolah/api-client";
import { useQuery } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type LinkedChild = components["schemas"]["LinkedChild"];
export type ParentRelation = components["schemas"]["ParentRelation"];
export type ChildCalendarDay = components["schemas"]["ChildCalendarDay"];
export type ChildSubjectGrade = components["schemas"]["ChildSubjectGrade"];
export type ChildGrades = components["schemas"]["ChildGrades"];
export type ChildViolation = components["schemas"]["ChildViolation"];
export type ChildWarningLetter = components["schemas"]["ChildWarningLetter"];
export type ChildDiscipline = components["schemas"]["ChildDiscipline"];
export type StudentBillHistory = components["schemas"]["StudentBillHistory"];

/**
 * Query keys local to this feature (packages/api-client/src/query-keys.ts
 * is another agent's file), all under `["family", ...]`.
 */
const keys = {
  myChildren: () => ["family", "my-children"] as const,
  attendance: (studentId: string, month: string) =>
    ["family", "child", studentId, "attendance", month] as const,
  grades: (studentId: string) => ["family", "child", studentId, "grades"] as const,
  discipline: (studentId: string) => ["family", "child", studentId, "discipline"] as const,
  billing: (studentId: string) => ["family", "child", studentId, "billing"] as const,
};

export function useMyChildrenQuery(enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.myChildren(),
    queryFn: () => client.GET("/v1/me/children"),
    enabled,
  });
}

export function useChildAttendanceQuery(studentId: string, month: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.attendance(studentId, month),
    queryFn: () =>
      client.GET("/v1/children/{studentId}/attendance", {
        params: { path: { studentId }, query: { month } },
      }),
    enabled: studentId !== "" && month !== "",
  });
}

export function useChildGradesQuery(studentId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.grades(studentId),
    queryFn: () =>
      client.GET("/v1/children/{studentId}/grades", { params: { path: { studentId } } }),
    enabled: studentId !== "",
  });
}

export function useChildDisciplineQuery(studentId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.discipline(studentId),
    queryFn: () =>
      client.GET("/v1/children/{studentId}/discipline", { params: { path: { studentId } } }),
    enabled: studentId !== "",
  });
}

/** A linked child's bills and payment history this year, read-only. */
export function useChildBillingQuery(studentId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.billing(studentId),
    queryFn: () =>
      client.GET("/v1/children/{studentId}/billing", { params: { path: { studentId } } }),
    enabled: studentId !== "",
  });
}

/** The current month as `YYYY-MM` in the browser's local time zone. */
export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
