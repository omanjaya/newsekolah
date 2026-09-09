"use client";

import { type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";
import { useActiveYear } from "../../lib/hooks/use-active-year";

export type CalendarEvent = components["schemas"]["CalendarEvent"];
export type CalendarEventKind = components["schemas"]["CalendarEventKind"];
export type CalendarEventInput = components["schemas"]["CalendarEventInput"];

function calendarKey(yearId: string) {
  return ["academic", "calendar-events", yearId] as const;
}

export function useCalendarEventsQuery() {
  const client = useApiClient();
  const year = useActiveYear();
  return useQuery({
    queryKey: calendarKey(year.id),
    queryFn: () =>
      client.GET("/v1/academic/years/{yearId}/calendar-events", {
        params: { path: { yearId: year.id }, query: { page_size: 200 } },
      }),
    enabled: year.id !== "",
  });
}

export function useCreateCalendarEventMutation() {
  const client = useApiClient();
  const year = useActiveYear();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CalendarEventInput) =>
      client.POST("/v1/academic/years/{yearId}/calendar-events", {
        params: { path: { yearId: year.id } },
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: calendarKey(year.id) });
    },
  });
}

export function useUpdateCalendarEventMutation() {
  const client = useApiClient();
  const year = useActiveYear();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CalendarEventInput }) =>
      client.PUT("/v1/academic/calendar-events/{eventId}", {
        params: { path: { eventId: id } },
        body,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: calendarKey(year.id) });
    },
  });
}

export function useDeleteCalendarEventMutation() {
  const client = useApiClient();
  const year = useActiveYear();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      client.DELETE("/v1/academic/calendar-events/{eventId}", {
        params: { path: { eventId: id } },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: calendarKey(year.id) });
    },
  });
}
