"use client";

import { type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type GradeLevel = components["schemas"]["GradeLevel"];
export type GradeLevelInput = components["schemas"]["GradeLevelInput"];
export type GradeLevelTemplate = components["schemas"]["GradeLevelTemplate"];
export type Track = components["schemas"]["Track"];
export type TrackInput = components["schemas"]["TrackInput"];
export type Room = components["schemas"]["Room"];
export type RoomInput = components["schemas"]["RoomInput"];

// Grade levels.

const GRADE_LEVELS_KEY = ["academic", "grade-levels"] as const;

export function useGradeLevelsQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: GRADE_LEVELS_KEY,
    queryFn: () => client.GET("/v1/academic/grade-levels"),
  });
}

function useInvalidateGradeLevels() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: GRADE_LEVELS_KEY });
}

export function useCreateGradeLevelMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateGradeLevels();
  return useMutation({
    mutationFn: (body: GradeLevelInput) => client.POST("/v1/academic/grade-levels", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useUpdateGradeLevelMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateGradeLevels();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: GradeLevelInput }) =>
      client.PUT("/v1/academic/grade-levels/{gradeLevelId}", {
        params: { path: { gradeLevelId: id } },
        body,
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useDeleteGradeLevelMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateGradeLevels();
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/academic/grade-levels/{gradeLevelId}", {
        params: { path: { gradeLevelId: id } },
      }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useApplyGradeLevelTemplateMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateGradeLevels();
  return useMutation({
    mutationFn: (template: GradeLevelTemplate) =>
      client.POST("/v1/academic/grade-levels/apply-template", { body: { template } }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

// Tracks (peminatan).

const TRACKS_KEY = ["academic", "tracks"] as const;

export function useTracksQuery() {
  const client = useApiClient();
  return useQuery({ queryKey: TRACKS_KEY, queryFn: () => client.GET("/v1/academic/tracks") });
}

function useInvalidateTracks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: TRACKS_KEY });
}

export function useCreateTrackMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateTracks();
  return useMutation({
    mutationFn: (body: TrackInput) => client.POST("/v1/academic/tracks", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useUpdateTrackMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateTracks();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: TrackInput }) =>
      client.PUT("/v1/academic/tracks/{trackId}", { params: { path: { trackId: id } }, body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useDeleteTrackMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateTracks();
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/academic/tracks/{trackId}", { params: { path: { trackId: id } } }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

// Rooms.

const ROOMS_KEY = ["academic", "rooms"] as const;

export function useRoomsQuery(search = "") {
  const client = useApiClient();
  return useQuery({
    queryKey: [...ROOMS_KEY, search],
    queryFn: () =>
      client.GET("/v1/academic/rooms", {
        params: { query: { page_size: 200, ...(search ? { search } : {}) } },
      }),
  });
}

function useInvalidateRooms() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ROOMS_KEY });
}

export function useCreateRoomMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateRooms();
  return useMutation({
    mutationFn: (body: RoomInput) => client.POST("/v1/academic/rooms", { body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useUpdateRoomMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateRooms();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RoomInput }) =>
      client.PUT("/v1/academic/rooms/{roomId}", { params: { path: { roomId: id } }, body }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}

export function useDeleteRoomMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateRooms();
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/academic/rooms/{roomId}", { params: { path: { roomId: id } } }),
    onSuccess: invalidate,

    meta: { errorToast: false },
  });
}
