/**
 * Centralized TanStack Query keys, per docs/04-clean-code.md ("key query
 * terpusat di features/*\/keys.ts") applied at the shared-client level so
 * web and mobile invalidate the same cache entries after a mutation.
 */
export const queryKeys = {
  me: () => ["me"] as const,
  sessions: () => ["auth", "sessions"] as const,
  tenantBranding: (tenantSlug?: string) => ["tenant", "branding", tenantSlug ?? "default"] as const,
  tenantLookup: (query: string) => ["tenant", "lookup", query] as const,

  notifications: (unreadOnly: boolean) => ["notifications", "list", unreadOnly] as const,
  notificationsUnreadCount: () => ["notifications", "unread-count"] as const,
  notificationPreferences: (kinds: string) => ["notifications", "preferences", kinds] as const,
  notificationSettings: () => ["notifications", "settings"] as const,
  pushDevices: () => ["notifications", "push-devices"] as const,

  whatsAppProviderConfig: () => ["whatsapp", "provider-config"] as const,
  whatsAppTemplates: () => ["whatsapp", "templates"] as const,
  whatsAppDeliveries: (status: string, cursor: string) =>
    ["whatsapp", "deliveries", status, cursor] as const,

  myAnnouncements: () => ["announcements", "me"] as const,
  announcements: (status: string, cursor: string) =>
    ["announcements", "admin", status, cursor] as const,
  announcement: (id: string) => ["announcements", "detail", id] as const,

  classes: (yearId: string) => ["academic", "classes", yearId] as const,
  subjects: () => ["academic", "subjects"] as const,
  periods: () => ["academic", "periods"] as const,
  teachingAssignments: (yearId: string, teacherId?: string) =>
    ["academic", "teaching-assignments", yearId, teacherId ?? ""] as const,
  enrollments: (classId: string) => ["academic", "enrollments", classId] as const,
  unassignedStudents: (yearId: string, search: string) =>
    ["academic", "unassigned", yearId, search] as const,

  users: (params: Record<string, string | boolean | undefined>) => ["users", params] as const,
  directory: (profileKind: string) => ["directory", profileKind] as const,
  schoolDays: (yearId: string) => ["academic", "school-days", yearId] as const,
  user: (id: string) => ["users", "detail", id] as const,
  roles: () => ["roles"] as const,
  permissions: () => ["permissions"] as const,
  dutyTypes: () => ["duties", "types"] as const,
  dutyAssignments: (yearId: string) => ["duties", "assignments", yearId] as const,
  auditLogs: (params: Record<string, string | undefined>) => ["audit-logs", params] as const,

  schedules: (params: Record<string, string | number | undefined>) =>
    ["schedules", params] as const,
  substitutions: (direction: string) => ["substitutions", direction] as const,
  journals: (yearId: string, classId?: string) => ["journals", yearId, classId ?? ""] as const,
  journal: (id: string) => ["journals", "detail", id] as const,

  attendanceToday: () => ["attendance", "today"] as const,
  attendanceSession: (id: string) => ["attendance", "session", id] as const,
  attendanceHomeroom: (date: string) => ["attendance", "homeroom", date] as const,
  attendanceCalendar: (month: string) => ["attendance", "calendar", month] as const,
  attendanceDailyReport: (classId: string, date: string) =>
    ["attendance", "report", classId, date] as const,
  attendanceMonthlyReport: (studentId: string, month: string) =>
    ["attendance", "monthly-report", studentId, month] as const,

  monitorSnapshot: () => ["monitor", "snapshot"] as const,
  monitorPresence: () => ["monitor", "presence"] as const,

  exitPermits: () => ["permits", "exit-permits"] as const,
  exitPermit: (id: string) => ["permits", "exit-permit", id] as const,
  leaveRequests: () => ["permits", "leave-requests"] as const,
  leaveRequest: (id: string) => ["permits", "leave-request", id] as const,
  leaveReviewQueue: () => ["permits", "leave-review-queue"] as const,
  lateArrivalCurrent: () => ["permits", "late-arrival", "current"] as const,
  lateArrival: (id: string) => ["permits", "late-arrival", id] as const,
  lateArrivalQueue: () => ["permits", "late-arrival-queue"] as const,
  workflowDefinitions: () => ["permits", "workflow-definitions"] as const,

  apiKeys: () => ["integrations", "api-keys"] as const,
  webhookEndpoints: () => ["integrations", "webhook-endpoints"] as const,
  webhookEventTypes: () => ["integrations", "event-types"] as const,
  webhookDeliveries: (endpointId: string, cursor: string) =>
    ["integrations", "webhook-deliveries", endpointId, cursor] as const,
};
