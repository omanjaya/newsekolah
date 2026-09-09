"use client";

import {
  useSessions as useSessionsBase,
  useRevokeSession as useRevokeSessionBase,
} from "@newsekolah/api-client/react";

import { useApiClient } from "../../lib/api/client";

export function useSessionsQuery() {
  const client = useApiClient();
  return useSessionsBase(client);
}

export function useRevokeSessionMutation() {
  const client = useApiClient();
  return useRevokeSessionBase(client);
}
