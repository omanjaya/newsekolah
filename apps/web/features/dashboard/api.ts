"use client";

import { useMe } from "@newsekolah/api-client/react";

import { useApiClient } from "../../lib/api/client";

/**
 * The dashboard has no aggregate endpoint of its own yet (docs/03's
 * `modules/reporting` is not built): it reads `/v1/me` only, the same
 * cached query the shell already populated via SessionProvider, so this
 * adds no extra request.
 */
export function useDashboardData() {
  const client = useApiClient();
  return useMe(client);
}
