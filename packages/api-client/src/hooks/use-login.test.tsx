// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ReactElement, ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createApiClient } from "../client.js";
import { queryKeys } from "../query-keys.js";

import { useLogin } from "./use-login.js";

const BASE_URL = "https://api.test.local";

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

function loginResponse(userId: string) {
  return {
    access_token: `token-${userId}`,
    access_expires_at: new Date().toISOString(),
    token_type: "Bearer",
    user: { id: userId, name: `User ${userId}`, permissions: [] },
  };
}

describe("useLogin", () => {
  // A fresh login must never let a PREVIOUS account's cached query results
  // -- data or, worse, a cached error (e.g. a 403 the outgoing account
  // legitimately hit on some screen) -- leak into the newly authenticated
  // session. Every query key in this package and the app's feature modules
  // carries no user/tenant discriminator (query-keys.ts), so the cache
  // itself is the only thing that can enforce this boundary; `useLogout`
  // already does it via `queryClient.clear()`, this is the login-side
  // mirror of that.
  it("clears stale cross-account cache entries (including cached errors) on success", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/auth/login`, () => HttpResponse.json(loginResponse("user-2"))),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    // Simulate a stale, previous-account artifact sitting in the cache --
    // exactly the shape of a query key grading, attendance, etc. use
    // (no user/tenant scoping), left behind by an earlier account's
    // now-irrelevant (and here, failed) fetch.
    const staleKey = ["grading", "gradebook", "class-1", "subject-1", ""] as const;
    queryClient.setQueryData(staleKey, { error: "stale-forbidden-from-previous-account" });
    expect(queryClient.getQueryData(staleKey)).toBeDefined();

    const client = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => null,
      clientHeader: "web/test",
    });

    function wrapper({ children }: { children: ReactNode }): ReactElement {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    const { result } = renderHook(() => useLogin(client), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ username: "u", password: "p", client: "web" });
    });

    // The stale entry from the previous account is gone.
    expect(queryClient.getQueryData(staleKey)).toBeUndefined();
    // The new account's session is seeded so route guards never see an
    // anonymous gap.
    expect(queryClient.getQueryData(queryKeys.me())).toEqual({
      id: "user-2",
      name: "User user-2",
      permissions: [],
    });
  });

  it("seeds `me` synchronously so an active observer never renders anonymous", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/auth/login`, () => HttpResponse.json(loginResponse("user-9"))),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const client = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => null,
      clientHeader: "web/test",
    });

    function wrapper({ children }: { children: ReactNode }): ReactElement {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    const { result } = renderHook(
      () => ({
        login: useLogin(client),
        // No real request ever completes for this observer -- the only
        // way it can see data is `useLogin`'s `setQueryData`, exactly
        // like a mounted RouteGuard/SessionProvider observing `me` while
        // a login is in flight.
        me: useQuery({
          queryKey: queryKeys.me(),
          queryFn: () => new Promise<null>(() => undefined),
          staleTime: Infinity,
        }),
      }),
      { wrapper },
    );

    await act(async () => {
      await result.current.login.mutateAsync({ username: "u", password: "p", client: "web" });
    });

    await waitFor(() => {
      expect(result.current.me.data).toEqual({
        id: "user-9",
        name: "User user-9",
        permissions: [],
      });
    });
  });
});
