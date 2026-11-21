"use client";

import { queryKeys } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";
import { isModuleEnabled, type FeatureModule } from "../../lib/modules/feature-modules";
import { useSession, type Me } from "../../lib/session/session-provider";

/** Every notification kind the API emits; drives the preferences matrix. */
export const NOTIFICATION_KINDS = [
  "announcement_published",
  "attendance_submitted",
  "substitution_requested",
  "substitution_responded",
  "substitution_cancelled",
  "leave_request_submitted",
  "leave_request_reviewed",
  "leave_request_issued",
  "exit_permit_stage_changed",
  "exit_permit_issued",
  "exit_permit_exited",
  "late_arrival_opened",
  "late_arrival_updated",
  "supervision_observation_scheduled",
  "supervision_observation_completed",
  "supervision_response_recorded",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * The feature module that emits each kind; `undefined` for an always-on
 * one. A switched-off module sends nothing, so its kinds are left out of
 * the preference, default and filter lists (the stored preferences are
 * kept and listed again once it is back on).
 */
export const NOTIFICATION_KIND_MODULE: Record<NotificationKind, FeatureModule | undefined> = {
  announcement_published: "announcements",
  attendance_submitted: undefined,
  substitution_requested: undefined,
  substitution_responded: undefined,
  substitution_cancelled: undefined,
  leave_request_submitted: "permits",
  leave_request_reviewed: "permits",
  leave_request_issued: "permits",
  exit_permit_stage_changed: "permits",
  exit_permit_issued: "permits",
  exit_permit_exited: "permits",
  late_arrival_opened: "permits",
  late_arrival_updated: "permits",
  supervision_observation_scheduled: "supervision",
  supervision_observation_completed: "supervision",
  supervision_response_recorded: "supervision",
};

/** The kinds of the modules that are on, in list order. */
export function availableNotificationKinds(
  isEnabled: (module: FeatureModule) => boolean,
): NotificationKind[] {
  return NOTIFICATION_KINDS.filter((kind) => {
    const module = NOTIFICATION_KIND_MODULE[kind];
    return !module || isEnabled(module);
  });
}

/** `availableNotificationKinds` for the signed-in reader's school. */
export function useNotificationKinds(): NotificationKind[] {
  const { me } = useSession();
  return availableNotificationKinds((module) => isModuleEnabled(me, module));
}

/**
 * Who can be sent each kind, read from where the API addresses it
 * (apps/api/internal/wiring/eventbridge.go): a reader holding any of the
 * permissions, or with one of the profile kinds, can receive it;
 * `undefined` for a kind that may reach anyone (an announcement). Duties
 * count, since `me.permissions` carries the active duties' permissions:
 * the homeroom duty's review_leave_requests, the counselor's
 * issue_leave_letters, security's scan_exit_permits. A student is the one
 * who submits leave requests and exit permits.
 */
export interface NotificationKindAudience {
  permissions?: readonly string[];
  profileKinds?: readonly NonNullable<Me["profile_kind"]>[];
}

const STUDENT_PERMISSIONS = ["submit_leave_requests"] as const;
const STUDENT: NotificationKindAudience = {
  permissions: STUDENT_PERMISSIONS,
  profileKinds: ["student"],
};
const HOMEROOM = ["review_leave_requests", "correct_attendance"] as const;

export const NOTIFICATION_KIND_AUDIENCE: Record<
  NotificationKind,
  NotificationKindAudience | undefined
> = {
  announcement_published: undefined,
  attendance_submitted: { permissions: HOMEROOM },
  substitution_requested: { permissions: ["manage_schedules"], profileKinds: ["teacher"] },
  substitution_responded: { permissions: ["manage_schedules"], profileKinds: ["teacher"] },
  // The requester and the substitute, when the other or a schedule
  // manager cancels the request.
  substitution_cancelled: { permissions: ["manage_schedules"], profileKinds: ["teacher"] },
  leave_request_submitted: { permissions: [...HOMEROOM, "issue_leave_letters"] },
  leave_request_reviewed: STUDENT,
  leave_request_issued: STUDENT,
  exit_permit_stage_changed: STUDENT,
  exit_permit_issued: {
    permissions: [...STUDENT_PERMISSIONS, "scan_exit_permits"],
    profileKinds: ["student"],
  },
  exit_permit_exited: STUDENT,
  late_arrival_opened: { permissions: HOMEROOM },
  late_arrival_updated: STUDENT,
  // The observed teacher hears of a planned visit and its result; the
  // observer (manage_supervision) of the teacher's response.
  supervision_observation_scheduled: { permissions: ["view_own_supervision"] },
  supervision_observation_completed: { permissions: ["view_own_supervision"] },
  supervision_response_recorded: { permissions: ["manage_supervision"] },
};

/** Whether `me` can ever be sent `kind`. */
export function canReceiveNotificationKind(
  kind: NotificationKind,
  me: Pick<Me, "permissions" | "profile_kind"> | undefined,
): boolean {
  const audience = NOTIFICATION_KIND_AUDIENCE[kind];
  if (!audience) return true;
  if (!me) return false;
  const byPermission = audience.permissions?.some((code) => me.permissions.includes(code));
  const byProfile =
    me.profile_kind !== undefined && audience.profileKinds?.includes(me.profile_kind);
  return Boolean(byPermission) || Boolean(byProfile);
}

/**
 * The kinds the signed-in reader can receive, of the modules that are on:
 * for the reader's own preferences and filters, where a kind they are
 * never sent is only noise. A school's defaults keep the full
 * `useNotificationKinds` list.
 */
export function useOwnNotificationKinds(): NotificationKind[] {
  const { me } = useSession();
  return availableNotificationKinds((module) => isModuleEnabled(me, module)).filter((kind) =>
    canReceiveNotificationKind(kind, me),
  );
}

export const NOTIFICATION_CHANNELS = ["inapp", "push", "email", "whatsapp"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface NotificationsFilter {
  unreadOnly: boolean;
  /** Case-insensitive substring match against title or body. */
  q?: string;
  /** Exact notification kind, e.g. "leave_request_submitted". */
  kind?: NotificationKind;
}

export function useNotificationsQuery(filter: NotificationsFilter) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.notifications(filter),
    queryFn: () =>
      client.GET("/v1/notifications", {
        params: {
          query: {
            unread_only: filter.unreadOnly,
            ...(filter.q ? { q: filter.q } : {}),
            ...(filter.kind ? { kind: filter.kind } : {}),
            limit: 50,
          },
        },
      }),
  });
}

export function useUnreadCountQuery(enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.notificationsUnreadCount(),
    queryFn: () => client.GET("/v1/notifications/unread-count"),
    refetchInterval: 60_000,
    // Pause polling on a hidden tab instead of ticking forever in the
    // background.
    refetchIntervalInBackground: false,
    enabled,
  });
}

function useInvalidateInbox() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["notifications", "list"] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notificationsUnreadCount() });
  };
}

export function useMarkReadMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateInbox();
  return useMutation({
    mutationFn: (notificationId: string) =>
      client.PUT("/v1/notifications/{notificationId}/read", {
        params: { path: { notificationId } },
      }),
    onSuccess: invalidate,
  });
}

export function useMarkAllReadMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateInbox();
  return useMutation({
    mutationFn: () => client.PUT("/v1/notifications/read-all"),
    onSuccess: invalidate,
  });
}

export function usePreferencesQuery() {
  const client = useApiClient();
  const kinds = NOTIFICATION_KINDS.join(",");
  return useQuery({
    queryKey: queryKeys.notificationPreferences(kinds),
    queryFn: () => client.GET("/v1/notification-preferences", { params: { query: { kinds } } }),
  });
}

export function useSetPreferenceMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      kind: NotificationKind;
      channel: NotificationChannel;
      enabled: boolean;
    }) => client.PUT("/v1/notification-preferences", { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications", "preferences"] });
    },

    meta: { errorToast: false },
  });
}

export function useNotificationSettingsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.notificationSettings(),
    queryFn: () => client.GET("/v1/notification-settings"),
  });
}

export interface NotificationSettingsInput {
  digest_enabled: boolean;
  digest_hour: number;
  quiet_hours_start?: number;
  quiet_hours_end?: number;
}

export function useUpdateNotificationSettingsMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: NotificationSettingsInput) =>
      client.PUT("/v1/notification-settings", { body }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.notificationSettings(), data);
    },

    meta: { errorToast: false },
  });
}

// Tenant-wide defaults (admin), as opposed to a signed-in user's own
// preferences above: a school configures what a new user starts with.

export function useTenantNotificationDefaultQuery(kind: NotificationKind) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.tenantNotificationDefault(kind),
    queryFn: () => client.GET("/v1/tenant/notification-defaults", { params: { query: { kind } } }),
  });
}

export function useSetTenantNotificationDefaultMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      kind: NotificationKind;
      channel: NotificationChannel;
      enabled: boolean;
    }) => client.PUT("/v1/tenant/notification-defaults", { body }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.tenantNotificationDefault(variables.kind),
      });
    },

    meta: { errorToast: false },
  });
}
