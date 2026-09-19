// Notifications and announcements.
import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiClient } from "@/lib/api/client";

export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: queryKeys.notifications({ unreadOnly }),
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
