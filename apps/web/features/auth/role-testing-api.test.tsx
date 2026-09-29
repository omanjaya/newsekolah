import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAccessToken, setAccessToken } from "../../lib/api/access-token";
import type { Me } from "../../lib/session/session-provider";
import {
  clearSimulation,
  getSimulationTime,
  setSimulation,
  syncSimulationIdentity,
} from "../../lib/simulation/clock";

import { useRoleTestingSwitchMutation } from "./role-testing-api";

const post = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api/client", () => ({ useApiClient: () => ({ POST: post }) }));

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
  it("drops old account queries, updates the observed me, and preserves the scoped test clock", async () => {
    const root = actor("root");
    const teacher = actor("teacher", "root");
    syncSimulationIdentity(root);
    setSimulation("frozen", new Date("2026-09-30T00:00:00Z"));
    setAccessToken("root-token");

    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        calls.push("clear-sat");
        return Promise.resolve(new Response(null, { status: 204 }));
      }),
    );
    post.mockImplementation(() => {
      calls.push("start");
      return Promise.resolve({ access_token: "teacher-token", user: teacher });
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["me"], root);
    client.setQueryData(["attendance", "private"], { secret: "root-only" });
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
    expect(getAccessToken()).toBe("teacher-token");
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
    ).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
});
