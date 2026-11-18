// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ReactElement, ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createApiClient } from "../client.js";
import { queryKeys } from "../query-keys.js";

import { useLogout } from "./use-logout.js";

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

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(queryKeys.me(), { id: "user-1" });
  queryClient.setQueryData(queryKeys.notificationsUnreadCount(), { count: 2 });
  queryClient.setQueryData(queryKeys.tenantBranding(), { name: "School" });
  const client = createApiClient({
    baseUrl: BASE_URL,
    getAccessToken: () => "token-user-1",
    clientHeader: "web/test",
  });
  function wrapper({ children }: { children: ReactNode }): ReactElement {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  const { result } = renderHook(() => useLogout(client), { wrapper });
  return { queryClient, result };
}

describe("useLogout", () => {
  it("empties the cache once the server ended the session, keeping the tenant's branding", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/auth/logout`, () => new HttpResponse(null, { status: 204 })),
    );
    const { queryClient, result } = setup();

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(queryClient.getQueryData(queryKeys.me())).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.notificationsUnreadCount())).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.tenantBranding())).toEqual({ name: "School" });
  });

  it("leaves the cache alone when the server did not end the session", async () => {
    server.use(
      http.post(`${BASE_URL}/v1/auth/logout`, () =>
        HttpResponse.json({ error: { code: "INTERNAL", message: "down" } }, { status: 503 }),
      ),
    );
    const { queryClient, result } = setup();

    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow();
    });

    expect(queryClient.getQueryData(queryKeys.me())).toEqual({ id: "user-1" });
    expect(queryClient.getQueryData(queryKeys.notificationsUnreadCount())).toEqual({ count: 2 });
  });
});
