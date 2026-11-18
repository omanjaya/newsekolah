import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
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

import { useRoleTestingSwitchMutation } from "./role-testing-api";

const post = vi.hoisted(() => vi.fn());
const forgetAccessToken = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api/client", () => ({
  useApiClient: () => ({ POST: post, forgetAccessToken }),
}));

function actor(id: string, actorId?: string): Me {
  return {
    id,
    name: id,
    username: id,
    permissions: actorId ? [] : ["platform_superadmin"],
    roles: [],
    tenant: { tenant_id: "school", timezone: "Asia/Makassar", locale: "id", name: "School" },
    must_change_password: false,
    ...(actorId ? { impersonated_by: { user_id: actorId, name: actorId } } : {}),
  } as unknown as Me;
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  clearSimulation();
  syncSimulationIdentity(undefined);
  setAccessToken(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("role-testing actor transition", () => {
  it("drops old account queries but the school's branding, updates the observed me, and preserves the scoped test clock", async () => {
    const root = actor("root");
    const teacher = actor("teacher", "root");
    syncSimulationIdentity(root);
    setSimulation("frozen", new Date("2026-09-30T00:00:00Z"));
    setAccessToken("root-token");

    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        calls.push(url === CLEAR_ACCESS_COOKIE_PATH ? "clear-sat" : url);
        return Promise.resolve(new Response(null, { status: 204 }));
      }),
    );
    post.mockImplementation(() => {
      calls.push("start");
      return Promise.resolve({ access_token: "teacher-token", user: teacher });
    });

    // Records which token the app held when the client was told to drop
    // the previous actor's refresh: it must come before the new one.
    let tokenWhenForgotten: string | null = "not called";
    forgetAccessToken.mockImplementation(() => {
      tokenWhenForgotten = getAccessToken();
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["me"], root);
    client.setQueryData(["attendance", "private"], { secret: "root-only" });
    client.setQueryData(["tenant", "branding", "default"], { name: "School" });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const view = renderHook(
      () => ({
        transition: useRoleTestingSwitchMutation(),
        me: useQuery({ queryKey: ["me"], queryFn: () => Promise.resolve(root), enabled: false }),
      }),
      { wrapper },
    );

    await act(async () => {
      await view.result.current.transition.mutateAsync({ userId: "teacher", role: "teacher" });
    });

    await waitFor(() => {
      expect(view.result.current.me.data?.id).toBe("teacher");
    });
    expect(calls).toEqual(["clear-sat", "start"]);
    expect(client.getQueryData(["attendance", "private"])).toBeUndefined();
    expect(client.getQueryData(["tenant", "branding", "default"])).toEqual({ name: "School" });
    expect(getAccessToken()).toBe("teacher-token");
    expect(forgetAccessToken).toHaveBeenCalledTimes(1);
    expect(tokenWhenForgotten).toBe("root-token");
    expect(getSimulationTime()).toBe("2026-09-30T00:00:00.000Z");
  });

  it("does not switch accounts if the server access cookie cannot be cleared", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 403 }))),
    );
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const view = renderHook(() => useRoleTestingSwitchMutation(), { wrapper });
    await expect(
      view.result.current.mutateAsync({ userId: "teacher", role: "teacher" }),
    ).rejects.toBeInstanceOf(ServerAccessCookieError);
    expect(post).not.toHaveBeenCalled();
  });
});
