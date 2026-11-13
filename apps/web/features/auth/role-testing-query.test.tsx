import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setAccessToken } from "../../lib/api/access-token";

import { useRoleTestingQuery } from "./role-testing-api";

const get = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api/client", () => ({ useApiClient: () => ({ GET: get }) }));
vi.mock("../../lib/session/session-provider", () => ({
  useSession: () => ({
    me: { id: "u1", tenant: { tenant_id: "school" }, impersonated_by: { user_id: "a1" } },
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ available: true, active: true, roles: [], users: [] });
  setAccessToken(null);
});

afterEach(() => {
  setAccessToken(null);
});

describe("useRoleTestingQuery", () => {
  it("waits for the access token so a cold load does not send a 401 request", async () => {
    const { result } = renderHook(() => useRoleTestingQuery({}, true), { wrapper });
    expect(get).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");

    act(() => {
      setAccessToken("token");
    });
    await waitFor(() => {
      expect(get).toHaveBeenCalledTimes(1);
    });
  });
});
