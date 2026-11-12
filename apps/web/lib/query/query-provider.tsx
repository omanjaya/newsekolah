"use client";

import { ApiError } from "@newsekolah/api-client";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { refreshSessionOnModuleDisabled } from "./module-disabled";
import { createMutationCache } from "./mutation-cache";

function createQueryClient() {
  // A request refused with MODULE_DISABLED means the session's module list is
  // stale; both caches report it so `/v1/me` is re-read (see module-disabled.ts).
  const onModuleError = (error: unknown) => {
    refreshSessionOnModuleDisabled(client, error);
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: onModuleError }),
    // See mutation-cache.ts: every mutation's default success/error toast.
    mutationCache: createMutationCache(onModuleError),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status < 500) {
            return false;
          }
          return failureCount < 2;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
  return client;
}

export function QueryProvider({ children }: { children: ReactNode }): ReactElement {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
