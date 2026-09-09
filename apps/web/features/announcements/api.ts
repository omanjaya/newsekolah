"use client";

import { queryKeys, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type Announcement = components["schemas"]["Announcement"];
export type AnnouncementCreate = components["schemas"]["AnnouncementCreate"];
export type AnnouncementStatus = components["schemas"]["AnnouncementStatus"];
export type MyAnnouncement = components["schemas"]["MyAnnouncement"];

export function useMyAnnouncementsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.myAnnouncements(),
    queryFn: () => client.GET("/v1/me/announcements"),
  });
}

export function useMarkAnnouncementReadMutation() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (announcementId: string) =>
      client.POST("/v1/me/announcements/{announcementId}/read", {
        params: { path: { announcementId } },
      }),
    onSuccess: (_data, announcementId) => {
      queryClient.setQueryData<{ data: MyAnnouncement[] }>(queryKeys.myAnnouncements(), (old) =>
        old
          ? { data: old.data.map((a) => (a.id === announcementId ? { ...a, is_read: true } : a)) }
          : old,
      );
    },
  });
}

export function useAnnouncementsQuery(status: AnnouncementStatus | "", cursor: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.announcements(status, cursor),
    queryFn: () =>
      client.GET("/v1/announcements", {
        params: {
          query: {
            ...(status ? { status } : {}),
            ...(cursor ? { cursor } : {}),
            limit: 20,
          },
        },
      }),
  });
}

export function useAnnouncementQuery(id: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.announcement(id),
    queryFn: () =>
      client.GET("/v1/announcements/{announcementId}", {
        params: { path: { announcementId: id } },
      }),
    enabled: id !== "",
  });
}

function useInvalidateAnnouncements() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["announcements"] });
  };
}

export function useCreateAnnouncementMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateAnnouncements();
  return useMutation({
    mutationFn: (body: AnnouncementCreate) => client.POST("/v1/announcements", { body }),
    onSuccess: invalidate,
  });
}

export function useUpdateAnnouncementMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateAnnouncements();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AnnouncementCreate }) =>
      client.PUT("/v1/announcements/{announcementId}", {
        params: { path: { announcementId: id } },
        body,
      }),
    onSuccess: invalidate,
  });
}

type Transition = "publish" | "schedule" | "archive";

export function useAnnouncementTransitionMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateAnnouncements();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: Transition }) => {
      const params = { params: { path: { announcementId: id } } };
      switch (action) {
        case "publish":
          return client.POST("/v1/announcements/{announcementId}/publish", params);
        case "schedule":
          return client.POST("/v1/announcements/{announcementId}/schedule", params);
        case "archive":
          return client.POST("/v1/announcements/{announcementId}/archive", params);
      }
    },
    onSuccess: invalidate,
  });
}

export function useDeleteAnnouncementMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateAnnouncements();
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/announcements/{announcementId}", {
        params: { path: { announcementId: id } },
      }),
    onSuccess: invalidate,
  });
}
