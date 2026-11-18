// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ReactElement, ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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

  // Branding names the school, not the reader, and the web app seeds it
  // from the server once per page load: dropping it would send one more
  // request to the public, rate-limited branding endpoint per sign-in.
  it("keeps the tenant's branding through the clear", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/auth/login`, () => HttpResponse.json(loginResponse("user-3"))),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(queryKeys.tenantBranding(), { name: "School" });
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

    expect(queryClient.getQueryData(queryKeys.tenantBranding())).toEqual({ name: "School" });
  });

  it("runs beforeRequest before the credentials go out, and sends none when it fails", async () => {
    const order: string[] = [];
    server.use(
      http.post(`${BASE_URL}/v1/auth/login`, () => {
        order.push("login");
        return HttpResponse.json(loginResponse("user-4"));
      }),
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
    const beforeRequest = vi.fn(() => {
      order.push("before");
      return Promise.resolve();
    });
    const onTokens = vi.fn();
    const { result } = renderHook(() => useLogin(client, { beforeRequest, onTokens }), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ username: "u", password: "p", client: "web" });
    });
    expect(order).toEqual(["before", "login"]);

    beforeRequest.mockRejectedValueOnce(new Error("cookie stayed"));
    onTokens.mockClear();
    await act(async () => {
      await expect(
        result.current.mutateAsync({ username: "u", password: "p", client: "web" }),
      ).rejects.toThrow("cookie stayed");
    });
    expect(order).toEqual(["before", "login"]);
    expect(onTokens).not.toHaveBeenCalled();
  });

  // The sign-in page's own `/v1/me` may have asked for a refresh that is
  // still on its way: it belongs to whoever was signed in before.
  it("drops any refresh still on its way before the new session's tokens are handed over", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/auth/login`, () => HttpResponse.json(loginResponse("user-5"))),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const client = createApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => null,
      clientHeader: "web/test",
    });
    const order: string[] = [];
    vi.spyOn(client, "forgetAccessToken").mockImplementation(() => {
      order.push("forget");
    });
    const onTokens = vi.fn(() => {
      order.push("tokens");
    });
    function wrapper({ children }: { children: ReactNode }): ReactElement {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }
    const { result } = renderHook(() => useLogin(client, { onTokens }), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ username: "u", password: "p", client: "web" });
    });

    expect(order).toEqual(["forget", "tokens"]);
  });
});
