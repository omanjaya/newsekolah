import { queryKeys } from "@newsekolah/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ put: vi.fn() }));

vi.mock("../../lib/api/client", () => ({ useApiClient: () => ({ PUT: mocks.put }) }));

import { useSetTenantFlagMutation } from "./api";

const TENANT_ID = "8a3f2d1e-0000-4000-8000-000000000001";

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(queryKeys.me(), { disabled_modules: ["visitors"] });
  queryClient.setQueryData(queryKeys.tenantBranding(), { disabled_public_modules: [] });
  queryClient.setQueryData(["platform", "tenants", TENANT_ID, "flags"], { data: [] });
  queryClient.setQueryData(["roles"], []);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useSetTenantFlagMutation(), { wrapper });
  return { queryClient, result };
}

describe("useSetTenantFlagMutation", () => {
  beforeEach(() => {
    mocks.put.mockReset();
    mocks.put.mockResolvedValue({ module: "visitors", enabled: true });
  });

  it("puts the flag for the tenant and module", async () => {
    const { result } = setup();
    await result.current.mutateAsync({ tenantId: TENANT_ID, module: "visitors", enabled: true });

    expect(mocks.put).toHaveBeenCalledWith("/v1/platform/tenants/{tenantId}/flags/{module}", {
      params: { path: { tenantId: TENANT_ID, module: "visitors" } },
      body: { enabled: true },
    });
  });

  it("refreshes the session and public branding, not only the console", async () => {
    const { queryClient, result } = setup();
    await result.current.mutateAsync({ tenantId: TENANT_ID, module: "visitors", enabled: true });

    expect(queryClient.getQueryState(queryKeys.me())?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(queryKeys.tenantBranding())?.isInvalidated).toBe(true);
    expect(
      queryClient.getQueryState(["platform", "tenants", TENANT_ID, "flags"])?.isInvalidated,
    ).toBe(true);
    expect(queryClient.getQueryState(["roles"])?.isInvalidated).toBe(false);
  });

  it("refreshes nothing when the save fails", async () => {
    mocks.put.mockRejectedValue(new Error("boom"));
    const { queryClient, result } = setup();

    await expect(
      result.current.mutateAsync({ tenantId: TENANT_ID, module: "visitors", enabled: true }),
    ).rejects.toThrow("boom");
    expect(queryClient.getQueryState(queryKeys.me())?.isInvalidated).toBe(false);
  });
});
