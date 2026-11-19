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

import { setDocumentPageTitle, setDocumentSchoolName } from "../../../lib/page-title";

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

  // The school's name is the public frame's job (public-site-frame.test.tsx).
  it("shows the not-available state instead while library is off", () => {
    mockUseTenant.mockReturnValue({
      branding: { disabled_public_modules: ["library"] },
      displayName: "SMA 1",
      isLoading: false,
    });
    renderGate();
    expect(screen.queryByText("catalogue")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "unavailableTitle" })).toBeInTheDocument();
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

  it("names the tab after the not-available state", () => {
    setDocumentSchoolName("SMA Contoh");
    mockUseTenant.mockReturnValue({
      branding: { disabled_public_modules: ["library"] },
      displayName: "SMA 1",
      isLoading: false,
    });
    renderGate();
    expect(document.title).toBe("unavailableTitle · SMA Contoh");
  });

  // The page it wraps names the tab; the gate itself must not clear that.
  it("leaves the tab to the catalogue it shows", () => {
    setDocumentSchoolName("SMA Contoh");
    setDocumentPageTitle("Katalog");
    mockUseTenant.mockReturnValue({
      branding: { disabled_public_modules: [] },
      displayName: "SMA 1",
      isLoading: false,
    });
    renderGate();
    expect(document.title).toBe("Katalog · SMA Contoh");
    setDocumentPageTitle(null);
  });
});
