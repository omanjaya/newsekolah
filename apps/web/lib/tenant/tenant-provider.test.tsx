import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TenantProvider, useTenant, type TenantBranding } from "./tenant-provider";

const get = vi.fn();

vi.mock("../api/client", () => ({ useApiClient: () => ({ GET: get }) }));

function Name() {
  return <span>{useTenant().displayName}</span>;
}

function renderProvider(initialBranding?: Partial<TenantBranding>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TenantProvider initialBranding={initialBranding as TenantBranding | undefined}>
        <Name />
      </TenantProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  get.mockReset();
});

describe("TenantProvider", () => {
  it("makes no browser request when the server already supplied the branding", () => {
    renderProvider({ name: "SMA Harapan" });
    expect(screen.getByText("SMA Harapan")).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it("fetches the branding when the server could not supply it", () => {
    get.mockResolvedValue({ name: "SMA Harapan" });
    renderProvider();
    expect(get).toHaveBeenCalledWith("/v1/tenant/branding");
  });
});
