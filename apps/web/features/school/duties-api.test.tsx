import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAccessToken, setAccessToken } from "../../lib/api/access-token";
import {
  CLEAR_ACCESS_COOKIE_PATH,
  ServerAccessCookieError,
} from "../../lib/session/clear-server-access-cookie";
import type { Me } from "../../lib/session/session-provider";
import {
  clearSimulation,
  getSimulationTime,
  setSimulation,
  syncSimulationIdentity,
} from "../../lib/simulation/clock";

import { useImpersonateUserMutation } from "./duties-api";

const post = vi.hoisted(() => vi.fn());
const forgetAccessToken = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api/client", () => ({
  useApiClient: () => ({ POST: post, forgetAccessToken }),
}));

function person(id: string, impersonatedBy?: string, permissions: string[] = []): Me {
  return {
    id,
    name: id,
    username: id,
    permissions,
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
const BRANDING_KEY = ["tenant", "branding", "default"];

/** The app's own query defaults that matter here (lib/query/query-provider.tsx). */
function appQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** Requests in the order they went out: "clear-sat" for the cookie route, "impersonate" for the API. */
let calls: string[] = [];
let clearSatStatus = 204;

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  clearSimulation();
  syncSimulationIdentity(admin);
  setAccessToken("admin-token");
  calls = [];
  clearSatStatus = 204;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      calls.push(url === CLEAR_ACCESS_COOKIE_PATH ? "clear-sat" : url);
      return Promise.resolve(new Response(null, { status: clearSatStatus }));
    }),
  );
  post.mockImplementation(() => {
    calls.push("impersonate");
    return Promise.resolve({ access_token: "teacher-token", user: teacher });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
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
    client.setQueryData(BRANDING_KEY, { name: "School" });
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
    // The school's branding is not the admin's: kept, so the switch costs
    // no request to the rate-limited public branding endpoint.
    expect(client.getQueryData(BRANDING_KEY)).toEqual({ name: "School" });
  });

  // A refresh still on its way for the admin would otherwise land after
  // the switch and hand the admin's token back over the teacher's.
  it("drops the admin's refresh still on its way before the teacher's token is set", async () => {
    let tokenWhenForgotten: string | null = "not called";
    forgetAccessToken.mockImplementation(() => {
      tokenWhenForgotten = getAccessToken();
    });
    const { result } = renderHook(() => useImpersonateUserMutation(), {
      wrapper: wrapperFor(appQueryClient()),
    });

    await act(async () => {
      await result.current.mutateAsync("teacher");
    });

    expect(forgetAccessToken).toHaveBeenCalledTimes(1);
    expect(tokenWhenForgotten).toBe("admin-token");
    expect(getAccessToken()).toBe("teacher-token");
  });

  // `sat` may still hold the admin's token, and the admin's own session is
  // not revoked by the start: a reload would render the admin's `/v1/me`,
  // without the impersonation strip, over the teacher's data.
  it("removes the server access cookie before asking to impersonate", async () => {
    const { result } = renderHook(() => useImpersonateUserMutation(), {
      wrapper: wrapperFor(appQueryClient()),
    });

    await act(async () => {
      await result.current.mutateAsync("teacher");
    });

    expect(calls).toEqual(["clear-sat", "impersonate"]);
  });

  // Privileged, and the wrong identity on screen matters more here than one
  // more try: it does not start, and the error says why (users-view.tsx).
  it("does not start when the server access cookie stays", async () => {
    clearSatStatus = 403;
    const client = appQueryClient();
    client.setQueryData(["me"], admin);
    const { result } = renderHook(() => useImpersonateUserMutation(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      await expect(result.current.mutateAsync("teacher")).rejects.toBeInstanceOf(
        ServerAccessCookieError,
      );
    });

    expect(post).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe("admin-token");
    expect(client.getQueryData<Me>(["me"])?.id).toBe("admin");
  });

  it("has a screen still showing the admin's reads read again, once, when the new me re-renders it", async () => {
    const client = appQueryClient();
    client.setQueryData(["me"], admin);
    client.setQueryData(["notifications", "unread-count"], { readAs: "admin-token" });
    const unreadCount = vi.fn(() => Promise.resolve({ readAs: getAccessToken() }));
    function UnreadCount(): ReactElement {
      const unread = useQuery({
        queryKey: ["notifications", "unread-count"],
        queryFn: () => unreadCount(),
      });
      return <span data-testid="unread">{unread.data?.readAs}</span>;
    }
    // Stands in for the shell, which SessionProvider's new `me` re-renders.
    // Removing a query notifies nobody, and the mutation below runs in a
    // separate root, so only this `me` reaches the count.
    function Shell(): ReactElement {
      const me = useQuery({
        queryKey: ["me"],
        queryFn: () => Promise.resolve(admin),
        enabled: false,
      });
      return (
        <div data-reader={me.data?.id}>
          <UnreadCount />
        </div>
      );
    }
    render(
      <QueryClientProvider client={client}>
        <Shell />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("unread")).toHaveTextContent("admin-token");
    const { result } = renderHook(() => useImpersonateUserMutation(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      await result.current.mutateAsync("teacher");
    });

    await waitFor(() => {
      expect(screen.getByTestId("unread")).toHaveTextContent("teacher-token");
    });
    expect(unreadCount).toHaveBeenCalledTimes(1);
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

  // Without this the impersonated account fetches with no clock until
  // SimulationSync catches up, then everything is fetched again with it.
  it("resumes the admin's saved test clock for the impersonated account at once", async () => {
    syncSimulationIdentity(person("admin", undefined, ["platform_superadmin"]));
    setSimulation("frozen", new Date("2026-09-30T00:00:00Z"));
    const { result } = renderHook(() => useImpersonateUserMutation(), {
      wrapper: wrapperFor(appQueryClient()),
    });

    await act(async () => {
      await result.current.mutateAsync("teacher");
    });

    expect(getSimulationTime()).toBe("2026-09-30T00:00:00.000Z");
  });
});
