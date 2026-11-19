"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

/**
 * Refetches every active query that failed, for the home's one retry. A
 * refetch after an error keeps the query's status at "error" until it
 * settles, so `retrying` tracks the run itself to show the button is busy.
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
