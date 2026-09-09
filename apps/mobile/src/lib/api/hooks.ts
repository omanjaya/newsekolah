// Query and mutation hooks for the Phase 1 mobile screens. Keys mirror
// @newsekolah/api-client's queryKeys so an invalidation on one screen
// refreshes the others.
import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";

export type Notification = components["schemas"]["Notification"];
export type MyAnnouncement = components["schemas"]["MyAnnouncement"];
export type SessionSummary = components["schemas"]["AttendanceSessionSummary"];
export type SessionDetail = components["schemas"]["AttendanceSessionDetail"];
export type SaveEntriesRequest = components["schemas"]["SaveAttendanceEntriesRequest"];
export type CalendarDay = components["schemas"]["AttendanceCalendarDay"];
export type WorkflowInstance = components["schemas"]["WorkflowInstance"];
export type ExitPermitDetail = components["schemas"]["ExitPermitDetail"];
export type LateArrivalDetail = components["schemas"]["LateArrivalDetail"];
export type LeaveRequestSummary = components["schemas"]["LeaveRequestSummary"];
export type LeaveRequestDetail = components["schemas"]["LeaveRequestDetail"];
export type IssuedScanToken = components["schemas"]["IssuedScanToken"];
export type ScanPurpose = components["schemas"]["ScanPurpose"];
export type LeaveCategory = components["schemas"]["LeaveCategory"];
export type Period = components["schemas"]["Period"];

const REFERENCE_STALE_MS = 5 * 60 * 1000;

export function useActiveYearId(): string {
  const { me } = useAuth();
  return me?.active_academic_year?.id ?? "";
}

// Notifications.

export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: queryKeys.notifications(unreadOnly),
    queryFn: () =>
      getApiClient().GET("/v1/notifications", {
        params: { query: { unread_only: unreadOnly, limit: 50 } },
      }),
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: queryKeys.notificationsUnreadCount(),
    queryFn: () => getApiClient().GET("/v1/notifications/unread-count"),
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) =>
      getApiClient().PUT("/v1/notifications/{notificationId}/read", {
        params: { path: { notificationId } },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getApiClient().PUT("/v1/notifications/read-all"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useRegisterPushDevice() {
  return useMutation({
    mutationFn: (body: components["schemas"]["PushDeviceRegistration"]) =>
      getApiClient().POST("/v1/push-devices", { body }),
  });
}

// Announcements.

export function useMyAnnouncements() {
  return useQuery({
    queryKey: queryKeys.myAnnouncements(),
    queryFn: () => getApiClient().GET("/v1/me/announcements"),
  });
}

export function useMarkAnnouncementRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (announcementId: string) =>
      getApiClient().POST("/v1/me/announcements/{announcementId}/read", {
        params: { path: { announcementId } },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.myAnnouncements() });
    },
  });
}

// Reference data.

export function useClasses() {
  const yearId = useActiveYearId();
  return useQuery({
    queryKey: queryKeys.classes(yearId),
    queryFn: () =>
      getApiClient().GET("/v1/academic/classes", {
        params: { query: { academic_year_id: yearId, page_size: 200 } },
      }),
    enabled: yearId !== "",
    staleTime: REFERENCE_STALE_MS,
  });
}

export function useSubjects() {
  return useQuery({
    queryKey: queryKeys.subjects(),
    queryFn: () =>
      getApiClient().GET("/v1/academic/subjects", { params: { query: { page_size: 200 } } }),
    staleTime: REFERENCE_STALE_MS,
  });
}

export function usePeriods() {
  return useQuery({
    queryKey: queryKeys.periods(),
    queryFn: async () => {
      const client = getApiClient();
      const templates = await client.GET("/v1/academic/period-templates");
      const template = templates.data.find((x) => x.is_default) ?? templates.data[0];
      if (!template) return [] as Period[];
      const periods = await client.GET("/v1/academic/period-templates/{templateId}/periods", {
        params: { path: { templateId: template.id } },
      });
      return [...periods.data].sort((a, b) => a.sequence - b.sequence);
    },
    staleTime: REFERENCE_STALE_MS,
  });
}

// Attendance.

export function useTodaySessions(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.attendanceToday(),
    queryFn: () => getApiClient().GET("/v1/attendance/me/today"),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useOpenSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { schedule_id: string; date: string }) =>
      getApiClient().POST("/v1/attendance/sessions", { body }),
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKeys.attendanceSession(detail.id), detail);
    },
  });
}

export function useSession(sessionId: string) {
  return useQuery({
    queryKey: queryKeys.attendanceSession(sessionId),
    queryFn: () =>
      getApiClient().GET("/v1/attendance/sessions/{sessionId}", {
        params: { path: { sessionId } },
      }),
    enabled: sessionId !== "",
  });
}

export function useSaveEntries(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveEntriesRequest) =>
      getApiClient().PUT("/v1/attendance/sessions/{sessionId}/entries", {
        params: { path: { sessionId } },
        body,
      }),
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKeys.attendanceSession(sessionId), detail);
      void queryClient.invalidateQueries({ queryKey: queryKeys.attendanceToday() });
    },
  });
}

export function useMyCalendar(month: string) {
  return useQuery({
    queryKey: queryKeys.attendanceCalendar(month),
    queryFn: () =>
      getApiClient().GET("/v1/attendance/me/calendar", { params: { query: { month } } }),
    enabled: month !== "",
  });
}

// Scan tokens and permits.

function useInvalidatePermits() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["permits"] });
  };
}

export function useIssueScanToken() {
  return useMutation({
    mutationFn: (body: { purpose: ScanPurpose; context_id?: string }) =>
      getApiClient().POST("/v1/scan-tokens", { body }),
  });
}

export function useScanClassroomEntry() {
  return useMutation({
    mutationFn: (token: string) =>
      getApiClient().POST("/v1/classroom-entry/scan", { body: { token } }),
  });
}

export function useMyExitPermits(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.exitPermits(),
    queryFn: () => getApiClient().GET("/v1/exit-permits", { params: { query: { limit: 20 } } }),
    enabled,
  });
}

export function useExitPermit(id: string) {
  return useQuery({
    queryKey: queryKeys.exitPermit(id),
    queryFn: () =>
      getApiClient().GET("/v1/exit-permits/{instanceId}", { params: { path: { instanceId: id } } }),
    enabled: id !== "",
    refetchInterval: 15_000,
  });
}

export function useCreateExitPermit() {
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: (body: { destination: string; start_period_id: string; end_period_id: string }) =>
      getApiClient().POST("/v1/exit-permits", { body }),
    onSuccess: invalidate,
  });
}

export function useScanExitPermitStage() {
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: ({ id, token }: { id: string; token: string }) =>
      getApiClient().POST("/v1/exit-permits/{instanceId}/scan", {
        params: { path: { instanceId: id } },
        body: { token },
      }),
    onSuccess: invalidate,
  });
}

export function useCancelExitPermit() {
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: (id: string) =>
      getApiClient().POST("/v1/exit-permits/{instanceId}/cancel", {
        params: { path: { instanceId: id } },
      }),
    onSuccess: invalidate,
  });
}

export function useIssueGateToken() {
  return useMutation({
    mutationFn: (id: string) =>
      getApiClient().POST("/v1/exit-permits/{instanceId}/gate-token", {
        params: { path: { instanceId: id } },
      }),
  });
}

export function useScanGate() {
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: ({ id, token }: { id: string; token: string }) =>
      getApiClient().POST("/v1/exit-permits/{instanceId}/gate-scan", {
        params: { path: { instanceId: id } },
        body: { token },
      }),
    onSuccess: invalidate,
  });
}

export function useCurrentLateArrival(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.lateArrivalCurrent(),
    queryFn: () => getApiClient().GET("/v1/late-arrivals/current"),
    enabled,
    retry: false,
  });
}

export function useOpenLateArrival() {
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: (body: { token: string; reason?: string }) =>
      getApiClient().POST("/v1/late-arrivals/open", { body }),
    onSuccess: invalidate,
  });
}

export function useScanLateArrivalStage() {
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: ({ id, token }: { id: string; token: string }) =>
      getApiClient().POST("/v1/late-arrivals/{instanceId}/scan", {
        params: { path: { instanceId: id } },
        body: { token },
      }),
    onSuccess: invalidate,
  });
}

export function useMyLeaveRequests(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.leaveRequests(),
    queryFn: () => getApiClient().GET("/v1/leave-requests", { params: { query: { limit: 20 } } }),
    enabled,
  });
}

export function useLeaveRequest(id: string) {
  return useQuery({
    queryKey: queryKeys.leaveRequest(id),
    queryFn: () =>
      getApiClient().GET("/v1/leave-requests/{instanceId}", { params: { path: { instanceId: id } } }),
    enabled: id !== "",
  });
}

export function useSubmitLeaveRequest() {
  const invalidate = useInvalidatePermits();
  return useMutation({
    mutationFn: (body: { category: LeaveCategory; reason: string; starts_on: string; ends_on: string }) =>
      getApiClient().POST("/v1/leave-requests", { body }),
    onSuccess: invalidate,
  });
}

// Grades, stars and discipline (student's own record).

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

export type LinkedChild = components["schemas"]["LinkedChild"];
export type ChildCalendarDay = components["schemas"]["ChildCalendarDay"];
export type ChildGrades = components["schemas"]["ChildGrades"];
export type ChildDiscipline = components["schemas"]["ChildDiscipline"];

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
