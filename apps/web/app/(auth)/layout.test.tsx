import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { initialsFor } from "../../lib/tenant/initials";

import AuthLayout from "./layout";

interface TenantHookResult {
  branding: { logo_url?: string; tagline?: string } | undefined;
  displayName: string;
  isLoading: boolean;
}

const mockUseTenant = vi.fn<() => TenantHookResult>();

vi.mock("../../lib/tenant/tenant-provider", () => ({
  useTenant: () => mockUseTenant(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function renderLayout() {
  return render(
    <AuthLayout>
      <h1>form</h1>
    </AuthLayout>,
  );
}

/**
 * One brand panel serves every width (a band above the form on a phone,
 * the left pane from 1024px), so the school's identity is written once.
 * jsdom does not evaluate media queries; these tests pin what the panel
 * says, not where CSS puts it.
 */
describe("AuthLayout brand panel", () => {
  it("names the school once, never the platform", () => {
    mockUseTenant.mockReturnValue({
      branding: {},
      displayName: "SMA 1 Denpasar",
      isLoading: false,
    });
    renderLayout();

    expect(screen.getAllByText("SMA 1 Denpasar")).toHaveLength(1);
    expect(screen.queryByText("SION")).not.toBeInTheDocument();
    // The banner landmark holds the identity; the form stays the main content.
    expect(screen.getByRole("banner")).toHaveTextContent("SMA 1 Denpasar");
    expect(screen.getByRole("main")).toHaveTextContent("form");
  });

  it("shows the school's initials as its mark when there is no logo", () => {
    mockUseTenant.mockReturnValue({
      branding: {},
      displayName: "SMA 1 Denpasar",
      isLoading: false,
    });
    const { container } = renderLayout();

    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByText(initialsFor("SMA 1 Denpasar"))).toBeInTheDocument();
  });

  it("shows the school's logo when it has one", () => {
    mockUseTenant.mockReturnValue({
      branding: { logo_url: "https://cdn.example.test/logo.png" },
      displayName: "SMA 1 Denpasar",
      isLoading: false,
    });
    const { container } = renderLayout();

    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "https://cdn.example.test/logo.png");
  });

  it("adds the school's tagline under its name when branding has one", () => {
    mockUseTenant.mockReturnValue({
      branding: { tagline: "Unggul dan berkarakter" },
      displayName: "SMA 1 Denpasar",
      isLoading: false,
    });
    renderLayout();

    expect(screen.getByText("Unggul dan berkarakter")).toBeInTheDocument();
  });

  it("holds the mark and name as skeletons while branding loads, never the SION fallback", () => {
    mockUseTenant.mockReturnValue({ branding: undefined, displayName: "SION", isLoading: true });
    const { container } = renderLayout();

    expect(screen.queryByText("SION")).not.toBeInTheDocument();
    expect(screen.queryByText("SI")).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2);
  });

  it("carries no product marketing, only the school", () => {
    mockUseTenant.mockReturnValue({
      branding: {},
      displayName: "SMA 1 Denpasar",
      isLoading: false,
    });
    renderLayout();

    for (const key of ["panelHeadline", "panelTagline", "featureAttendance", "featureLibrary"]) {
      expect(screen.queryByText(key)).not.toBeInTheDocument();
    }
  });
});
