import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAccessToken, setAccessToken } from "../../lib/api/access-token";
import type { Me } from "../../lib/session/session-provider";
import { clearSimulation, syncSimulationIdentity } from "../../lib/simulation/clock";

import { useImpersonateUserMutation } from "./duties-api";

const post = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api/client", () => ({ useApiClient: () => ({ POST: post }) }));

function person(id: string, impersonatedBy?: string): Me {
  return {
    id,
    name: id,
    username: id,
    permissions: [],
    roles: [],
    tenant: { tenant_id: "school", timezone: "Asia/Makassar", locale: "id", name: "School" },
    must_change_password: false,
    ...(impersonatedBy
      ? { impersonated_by: { user_id: impersonatedBy, name: impersonatedBy } }
      : {}),
  } as unknown as Me;
}

const admin = person("admin");
const teacher = person("teacher", "admin");

/** The app's own query defaults that matter here (lib/query/query-provider.tsx). */
function appQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  clearSimulation();
  syncSimulationIdentity(admin);
  setAccessToken("admin-token");
  post.mockResolvedValue({ access_token: "teacher-token", user: teacher });
});

// No query key names the reader, and SimulationSync refetches only when
// the business clock moves: whatever the admin read stays on screen for
// the impersonated account unless the switch itself drops it.
describe("useImpersonateUserMutation", () => {
  it("drops the admin's cached data before the impersonated account reads anything", async () => {
    const client = appQueryClient();
    client.setQueryData(["me"], admin);
    client.setQueryData(["notifications", "unread-count"], { count: 7 });
    client.setQueryData(["dashboard", "home"], { owner: "admin" });
    const { result } = renderHook(() => useImpersonateUserMutation(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      await result.current.mutateAsync("teacher");
    });

    expect(post).toHaveBeenCalledWith("/v1/users/{userId}/impersonate", {
      params: { path: { userId: "teacher" } },
      body: { client: "web" },
    });
    expect(getAccessToken()).toBe("teacher-token");
    expect(client.getQueryData(["notifications", "unread-count"])).toBeUndefined();
    expect(client.getQueryData(["dashboard", "home"])).toBeUndefined();
    expect(client.getQueryData<Me>(["me"])?.id).toBe("teacher");
  });

  it("has a screen still on display read again, once, as the impersonated account", async () => {
    // The header stays mounted across the navigation that follows, and a
    // count read a moment ago is still fresh, so nothing else reads it.
    const client = appQueryClient();
    client.setQueryData(["me"], admin);
    client.setQueryData(["notifications", "unread-count"], { readAs: "admin-token" });
    const unreadCount = vi.fn(() => Promise.resolve({ readAs: getAccessToken() }));
    const view = renderHook(
      () => ({
        impersonate: useImpersonateUserMutation(),
        // Stands in for SessionProvider, whose new `me` re-renders the shell.
        me: useQuery({ queryKey: ["me"], queryFn: () => Promise.resolve(admin), enabled: false }),
        unread: useQuery({
          queryKey: ["notifications", "unread-count"],
          queryFn: () => unreadCount(),
        }),
      }),
      { wrapper: wrapperFor(client) },
    );
    expect(view.result.current.unread.data).toEqual({ readAs: "admin-token" });

    await act(async () => {
      await view.result.current.impersonate.mutateAsync("teacher");
    });

    await waitFor(() => {
      expect(view.result.current.unread.data).toEqual({ readAs: "teacher-token" });
    });
    expect(unreadCount).toHaveBeenCalledTimes(1);
    expect(view.result.current.me.data?.id).toBe("teacher");
  });

  it("keeps a response still on its way for the admin out of the cache", async () => {
    const client = appQueryClient();
    client.setQueryData(["me"], admin);
    let answerAdmin: (value: { owner: string }) => void = () => undefined;
    const adminAnswer = new Promise<{ owner: string }>((resolve) => {
      answerAdmin = resolve;
    });
    const adminRead = client
      .query({ queryKey: ["dashboard", "home"], queryFn: () => adminAnswer })
      .catch(() => undefined);
    const { result } = renderHook(() => useImpersonateUserMutation(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      await result.current.mutateAsync("teacher");
    });
    answerAdmin({ owner: "admin" });
    await adminRead;

    expect(client.getQueryData(["dashboard", "home"])).toBeUndefined();
  });
});
