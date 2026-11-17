"use client";

import { queryKeys } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";
import { isModuleEnabled } from "../../lib/modules/feature-modules";
import { useSession } from "../../lib/session/session-provider";

import { NOTIFICATION_KINDS, availableNotificationKinds, type NotificationKind } from "./kinds";

// The kind list lives in kinds.ts, free of React, so the realtime hooks can
// share it; re-exported here for the screens that already import from api.
export {
  NOTIFICATION_KINDS,
  NOTIFICATION_KIND_MODULE,
  availableNotificationKinds,
  notificationKindsOf,
  type NotificationKind,
} from "./kinds";

/** `availableNotificationKinds` for the signed-in reader's school. */
export function useNotificationKinds(): NotificationKind[] {
  const { me } = useSession();
  return availableNotificationKinds((module) => isModuleEnabled(me, module));
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
