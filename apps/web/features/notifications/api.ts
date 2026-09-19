"use client";

import { queryKeys } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

/** Every notification kind the API emits; drives the preferences matrix. */
export const NOTIFICATION_KINDS = [
  "announcement_published",
  "attendance_submitted",
  "substitution_requested",
  "substitution_responded",
  "leave_request_submitted",
  "leave_request_reviewed",
  "leave_request_issued",
  "exit_permit_stage_changed",
  "exit_permit_issued",
  "exit_permit_exited",
  "late_arrival_opened",
  "late_arrival_updated",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

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
  });
}
