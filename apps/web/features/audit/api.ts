"use client";

import type { components } from "@newsekolah/api-client";
import { useQuery } from "@tanstack/react-query";

import { useApiClient } from "../../lib/api/client";

export type AuditLogEntry = components["schemas"]["AuditLogEntry"];

export interface AuditLogsFilter {
  actorUserId?: string;
  entityType?: string;
  from?: string;
  to?: string;
  cursor?: string;
}

/**
 * Query keys stay local to this file (never `packages/api-client`'s shared
 * `queryKeys`) so the audit screen can evolve its own filter shape without
 * touching code other features depend on.
 */
const AUDIT_LOGS_KEY = (filter: AuditLogsFilter) =>
  [
    "audit",
    "logs",
    filter.actorUserId ?? "",
    filter.entityType ?? "",
    filter.from ?? "",
    filter.to ?? "",
    filter.cursor ?? "",
  ] as const;

export function useAuditLogsQuery(filter: AuditLogsFilter) {
  const client = useApiClient();
  return useQuery({
    queryKey: AUDIT_LOGS_KEY(filter),
    queryFn: () =>
      client.GET("/v1/audit-logs", {
        params: {
          query: {
            ...(filter.actorUserId ? { actor_user_id: filter.actorUserId } : {}),
            ...(filter.entityType ? { entity_type: filter.entityType } : {}),
            ...(filter.from ? { from: filter.from } : {}),
            ...(filter.to ? { to: filter.to } : {}),
            ...(filter.cursor ? { cursor: filter.cursor } : {}),
            limit: 50,
          },
        },
      }),
  });
}
