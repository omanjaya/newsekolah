"use client";

import { type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type LinkedChild = components["schemas"]["LinkedChild"];
export type LeaveCategory = components["schemas"]["LeaveCategory"];
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

/**
 * A guardian opens a planned leave request for a linked child. The server
 * still requires the caller to be an approving guardian of that student
 * (same link the guardian review queue already relies on), so this can
 * only ever succeed for a child the caller is actually allowed to act for.
 */
export function useSubmitChildLeaveRequestMutation(studentId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      category: LeaveCategory;
      reason: string;
      starts_on: string;
      ends_on: string;
    }) =>
      client.POST("/v1/children/{studentId}/leave-requests", {
        params: { path: { studentId } },
        body,
      }),
    onSuccess: () => {
      // The new request may land straight in the caller's own guardian
      // review queue (a single-stage workflow with them as approver), so
      // that queue -- shown both on this screen and the dashboard -- needs
      // to reflect it immediately.
      void queryClient.invalidateQueries({ queryKey: ["permits"] });
    },
  });
}

/** The current month as `YYYY-MM` in the browser's local time zone. */
export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Today as "YYYY-MM-DD" in the school's own time zone, not the browser's. */
export function todayInZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** "YYYY-MM-DD" shifted by `delta` days, staying in UTC so DST never skips a day. */
function shiftDate(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + delta));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/** The last 7 calendar days up to and including `date` (oldest first). */
export function last7Days(date: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftDate(date, i - 6));
}
