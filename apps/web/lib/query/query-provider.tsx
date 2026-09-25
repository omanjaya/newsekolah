"use client";

import { ApiError } from "@newsekolah/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactElement, ReactNode } from "react";

import { createMutationCache } from "./mutation-cache";

function createQueryClient() {
  return new QueryClient({
    // See mutation-cache.ts: every mutation's default success/error toast.
    mutationCache: createMutationCache(),
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
}

export function QueryProvider({ children }: { children: ReactNode }): ReactElement {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
