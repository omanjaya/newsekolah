import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { initialsFor } from "../../lib/tenant/initials";

import AuthLayout from "./layout";

interface TenantHookResult {
  branding: { logo_url?: string } | undefined;
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

/**
 * The mobile header (`TenantBrand`, shown above the card) and the desktop
 * hero (`BrandLockup`, the `aside`) are both always present in the DOM —
 * Tailwind's `lg:hidden` / `hidden lg:flex` decide which one is visible at
 * which viewport width. jsdom doesn't evaluate media queries, so these
 * tests assert both panes carry the same tenant identity and that the
 * classes wiring up the narrow/wide split are still in place, rather than
 * resizing a real viewport.
 */
describe("AuthLayout brand consistency across breakpoints", () => {
  it("shows the tenant's name in both the mobile header and the desktop hero, never the platform name", () => {
    mockUseTenant.mockReturnValue({
      branding: { logo_url: undefined },
      displayName: "SMA 1 Denpasar",
      isLoading: false,
    });

    const { container } = render(
      <AuthLayout>
        <p>form</p>
      </AuthLayout>,
    );

    const mobileWrapper = container.querySelector<HTMLElement>('[class*="lg:hidden"]');
    if (!mobileWrapper) throw new Error("mobile brand wrapper not found");
    expect(within(mobileWrapper).getByText("SMA 1 Denpasar")).toBeInTheDocument();

    const hero = container.querySelector<HTMLElement>("aside");
    if (!hero) throw new Error("desktop hero not found");
    expect(hero).toHaveClass("hidden");
    expect(hero).toHaveClass("lg:flex");
    expect(within(hero).getByText("SMA 1 Denpasar")).toBeInTheDocument();

    expect(screen.queryByText("SION")).not.toBeInTheDocument();
  });

  it("falls back to the tenant's initials, not a logo image, in both panes when there is no logo", () => {
    const displayName = "SMA 1 Denpasar";
    mockUseTenant.mockReturnValue({
      branding: { logo_url: undefined },
      displayName,
      isLoading: false,
    });

    const { container } = render(
      <AuthLayout>
        <p>form</p>
      </AuthLayout>,
    );

    expect(container.querySelectorAll("img")).toHaveLength(0);
    // The mobile TenantBrand mark, the desktop BrandLockup mark, and the
    // desktop hero's faint decorative watermark all use the same initials.
    expect(screen.getAllByText(initialsFor(displayName))).toHaveLength(3);
  });

  it("renders the tenant's logo in both panes when the tenant has one", () => {
    mockUseTenant.mockReturnValue({
      branding: { logo_url: "https://cdn.example.test/logo.png" },
      displayName: "SMA 1 Denpasar",
      isLoading: false,
    });

    const { container } = render(
      <AuthLayout>
        <p>form</p>
      </AuthLayout>,
    );

    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(2);
    for (const img of images) {
      expect(img).toHaveAttribute("src", "https://cdn.example.test/logo.png");
    }
  });

  it("shows a neutral skeleton in both panes while branding loads, never the SION fallback", () => {
    mockUseTenant.mockReturnValue({ branding: undefined, displayName: "SION", isLoading: true });

    const { container } = render(
      <AuthLayout>
        <p>form</p>
      </AuthLayout>,
    );

    expect(screen.queryByText("SION")).not.toBeInTheDocument();
    // Two skeleton blocks (mark + name) in the mobile header and two in the desktop hero.
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(4);
    // The decorative initials watermark ("SI", from the SION fallback) is left
    // out entirely while loading, not shown faint-but-wrong.
    expect(screen.queryByText("SI")).not.toBeInTheDocument();
  });
});
