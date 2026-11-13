import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface TenantHookResult {
  branding: { disabled_public_modules?: string[] } | undefined;
  displayName: string;
  isLoading: boolean;
}

const mockUseTenant = vi.fn<() => TenantHookResult>();

vi.mock("../../../lib/tenant/tenant-provider", () => ({
  useTenant: () => mockUseTenant(),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { OpacGate } from "./opac-gate";

function renderGate(): void {
  render(
    <OpacGate>
      <p>catalogue</p>
    </OpacGate>,
  );
}

describe("OpacGate", () => {
  beforeEach(() => {
    mockUseTenant.mockReset();
  });

  it("shows the catalogue while the school has library on", () => {
    mockUseTenant.mockReturnValue({
      branding: { disabled_public_modules: [] },
      displayName: "SMA 1",
      isLoading: false,
    });
    renderGate();
    expect(screen.getByText("catalogue")).toBeInTheDocument();
    expect(screen.queryByText("unavailableTitle")).not.toBeInTheDocument();
  });

  it("shows a branded not-available page instead while library is off", () => {
    mockUseTenant.mockReturnValue({
      branding: { disabled_public_modules: ["library"] },
      displayName: "SMA 1",
      isLoading: false,
    });
    renderGate();
    expect(screen.queryByText("catalogue")).not.toBeInTheDocument();
    expect(screen.getByText("unavailableTitle")).toBeInTheDocument();
    expect(screen.getByText("SMA 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "signIn" })).toHaveAttribute("href", "/login");
  });

  it("mounts nothing of the catalogue while branding is still loading", () => {
    mockUseTenant.mockReturnValue({ branding: undefined, displayName: "SION", isLoading: true });
    renderGate();
    expect(screen.queryByText("catalogue")).not.toBeInTheDocument();
  });

  it("falls back to the catalogue when branding could not be loaded", () => {
    mockUseTenant.mockReturnValue({ branding: undefined, displayName: "SION", isLoading: false });
    renderGate();
    expect(screen.getByText("catalogue")).toBeInTheDocument();
  });
});
