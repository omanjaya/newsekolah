"use client";

import { ApiError, type components } from "@newsekolah/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getAccessToken } from "../../lib/api/access-token";
import { useApiClient } from "../../lib/api/client";
import { API_URL } from "../../lib/env";

export type ExpectedGuest = components["schemas"]["ExpectedGuest"];
export type ExpectedGuestWrite = components["schemas"]["ExpectedGuestWrite"];
export type Visit = components["schemas"]["Visit"];
export type BoardEntry = components["schemas"]["BoardEntry"];
export type CheckInInput = components["schemas"]["CheckInInput"];
export type Incident = components["schemas"]["Incident"];
export type IncidentWrite = components["schemas"]["IncidentWrite"];
export type VisitorRecap = components["schemas"]["VisitorRecap"];

/** Query keys local to this feature, all under `["visitors", ...]`. */
const keys = {
  board: () => ["visitors", "board"] as const,
  expected: (date: string, includeResolved: boolean) =>
    ["visitors", "expected", date, includeResolved] as const,
  visits: (from: string, to: string) => ["visitors", "visits", from, to] as const,
  visit: (id: string) => ["visitors", "visit", id] as const,
  badgeUrl: (id: string) => ["visitors", "badge-url", id] as const,
  incidents: (from: string, to: string, includeClosed: boolean) =>
    ["visitors", "incidents", from, to, includeClosed] as const,
  incident: (id: string) => ["visitors", "incident", id] as const,
  dailyRecap: (date: string) => ["visitors", "recap", "daily", date] as const,
  monthlyRecap: (month: string) => ["visitors", "recap", "monthly", month] as const,
};

function useInvalidateVisitors() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["visitors"] });
}

// Gate board.

export function useVisitorBoardQuery() {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.board(),
    queryFn: () => client.GET("/v1/visitors/board"),
    refetchInterval: 30_000,
  });
}

export function useCheckInVisitMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateVisitors();
  return useMutation({
    mutationFn: (body: CheckInInput) => client.POST("/v1/visitors/visits", { body }),
    onSuccess: invalidate,
  });
}

export function useCheckOutVisitMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateVisitors();
  return useMutation({
    mutationFn: (visitId: string) =>
      client.POST("/v1/visitors/visits/{visitId}/check-out", { params: { path: { visitId } } }),
    onSuccess: invalidate,
  });
}

export function useVisitBadgeUrlQuery(visitId: string, enabled: boolean) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.badgeUrl(visitId),
    queryFn: () =>
      client.GET("/v1/visitors/visits/{visitId}/badge-url", { params: { path: { visitId } } }),
    enabled: enabled && visitId !== "",
  });
}

export function useVisitsQuery(from: string, to: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.visits(from, to),
    queryFn: () =>
      client.GET("/v1/visitors/visits", { params: { query: { from, to, limit: 200 } } }),
    enabled: from !== "" && to !== "",
  });
}

// Expected guests.

export function useExpectedGuestsQuery(date: string, includeResolved = false) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.expected(date, includeResolved),
    queryFn: () =>
      client.GET("/v1/visitors/expected-guests", {
        params: { query: { date, include_resolved: includeResolved } },
      }),
    enabled: date !== "",
  });
}

export function useCreateExpectedGuestMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateVisitors();
  return useMutation({
    mutationFn: (body: ExpectedGuestWrite) => client.POST("/v1/visitors/expected-guests", { body }),
    onSuccess: invalidate,
  });
}

export function useCancelExpectedGuestMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateVisitors();
  return useMutation({
    mutationFn: (expectedGuestId: string) =>
      client.DELETE("/v1/visitors/expected-guests/{expectedGuestId}", {
        params: { path: { expectedGuestId } },
      }),
    onSuccess: invalidate,
  });
}

// Incidents.

export function useIncidentsQuery(from: string, to: string, includeClosed = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.incidents(from, to, includeClosed),
    queryFn: () =>
      client.GET("/v1/visitors/incidents", {
        params: { query: { from, to, include_closed: includeClosed, limit: 200 } },
      }),
    enabled: from !== "" && to !== "",
  });
}

export function useIncidentQuery(incidentId: string, enabled: boolean) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.incident(incidentId),
    queryFn: () =>
      client.GET("/v1/visitors/incidents/{incidentId}", { params: { path: { incidentId } } }),
    enabled: enabled && incidentId !== "",
  });
}

export function useCreateIncidentMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateVisitors();
  return useMutation({
    mutationFn: (body: IncidentWrite) => client.POST("/v1/visitors/incidents", { body }),
    onSuccess: invalidate,
  });
}

export function useUpdateIncidentMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateVisitors();
  return useMutation({
    mutationFn: ({ id, ...body }: IncidentWrite & { id: string }) =>
      client.PUT("/v1/visitors/incidents/{incidentId}", {
        params: { path: { incidentId: id } },
        body,
      }),
    onSuccess: invalidate,
  });
}

export function useCloseIncidentMutation() {
  const client = useApiClient();
  const invalidate = useInvalidateVisitors();
  return useMutation({
    mutationFn: (incidentId: string) =>
      client.POST("/v1/visitors/incidents/{incidentId}/close", {
        params: { path: { incidentId } },
      }),
    onSuccess: invalidate,
  });
}

// Recap.

export function useDailyRecapQuery(date: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.dailyRecap(date),
    queryFn: () => client.GET("/v1/visitors/recap/daily", { params: { query: { date } } }),
    enabled: date !== "",
  });
}

export function useMonthlyRecapQuery(month: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: keys.monthlyRecap(month),
    queryFn: () => client.GET("/v1/visitors/recap/monthly", { params: { query: { month } } }),
    enabled: month !== "",
  });
}

async function readErrorCode(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "code" in body && typeof body.code === "string") {
      return body.code;
    }
  } catch {
    // Response body was not JSON (or empty); fall through to the generic code.
  }
  return "UNKNOWN";
}

/**
 * Runs a recap export and saves the resulting workbook. Uses a direct
 * `fetch` rather than the shared API client, same as `features/reports`:
 * the client parses every response as JSON, but this endpoint returns an
 * XLSX binary.
 */
async function downloadRecapExport(path: string, filename: string): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    const code = await readErrorCode(response);
    throw new ApiError({ status: response.status, code, message: code });
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function useExportDailyRecapMutation() {
  return useMutation({
    mutationFn: (date: string) =>
      downloadRecapExport(
        `/v1/visitors/recap/daily/export?date=${encodeURIComponent(date)}`,
        `rekap-tamu-${date}.xlsx`,
      ),
  });
}

export function useExportMonthlyRecapMutation() {
  return useMutation({
    mutationFn: (month: string) =>
      downloadRecapExport(
        `/v1/visitors/recap/monthly/export?month=${encodeURIComponent(month)}`,
        `rekap-tamu-${month}.xlsx`,
      ),
  });
}
