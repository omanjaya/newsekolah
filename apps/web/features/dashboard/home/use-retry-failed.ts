"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

/**
 * Refetches every active query that failed, for the home's one retry. A
 * refetch keeps a failed query's status at "error" only when it once had
 * data; one that never loaded goes back to "pending" until the run
 * settles. Neither says the reader asked for it, so `retrying` tracks the
 * run itself, to show the button is busy and to hold the home's failed
 * state in place meanwhile (components/dashboard-view.tsx).
 */
export function useRetryFailedQueries(): { retrying: boolean; retry: () => void } {
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const retry = () => {
    setRetrying(true);
    void queryClient
      .refetchQueries({ type: "active", predicate: (query) => query.state.status === "error" })
      .finally(() => {
        setRetrying(false);
      });
  };
  return { retrying, retry };
}
