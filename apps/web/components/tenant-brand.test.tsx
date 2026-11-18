import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { initialsFor } from "../lib/tenant/initials";

import { TenantBrand } from "./tenant-brand";

interface TenantHookResult {
  branding: { logo_url?: string; accent_color?: string } | undefined;
  displayName: string;
  isLoading: boolean;
}

const mockUseTenant = vi.fn<() => TenantHookResult>();

vi.mock("../lib/tenant/tenant-provider", () => ({
  useTenant: () => mockUseTenant(),
}));

describe("TenantBrand", () => {
  it("shows a neutral skeleton instead of the SION fallback while branding is loading", () => {
    mockUseTenant.mockReturnValue({ branding: undefined, displayName: "SION", isLoading: true });

    const { container } = render(<TenantBrand />);

    // No product-name text, no tenant name text, no logo image — just placeholders.
    expect(screen.queryByText("SION")).not.toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2);
  });

  it("shows only the mark skeleton in mark mode while loading, no name placeholder", () => {
    mockUseTenant.mockReturnValue({ branding: undefined, displayName: "SION", isLoading: true });

    const { container } = render(<TenantBrand mark />);

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1);
  });

  it("renders the tenant's logo and name once branding has loaded", () => {
    mockUseTenant.mockReturnValue({
      branding: { logo_url: "https://cdn.example.test/logo.png" },
      displayName: "SMA 1 Denpasar",
      isLoading: false,
    });

    const { container } = render(<TenantBrand />);

    expect(screen.getByText("SMA 1 Denpasar")).toBeInTheDocument();
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://cdn.example.test/logo.png");
    // Decorative: empty alt, not exposed as content.
    expect(img).toHaveAttribute("alt", "");
  });

  it("falls back to the tenant's initials, not the platform name, when there is no logo", () => {
    const displayName = "SMA 1 Denpasar";
    mockUseTenant.mockReturnValue({
      branding: { logo_url: undefined },
      displayName,
      isLoading: false,
    });

    const { container } = render(<TenantBrand />);

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText(initialsFor(displayName))).toBeInTheDocument();
    expect(screen.getByText(displayName)).toBeInTheDocument();
    expect(screen.queryByText("SION")).not.toBeInTheDocument();
  });

  it("writes the initials in the colour chosen for the mark's own fill, not the themed accent label", () => {
    mockUseTenant.mockReturnValue({
      branding: { logo_url: undefined, accent_color: "#0F7A5F" },
      displayName: "SMA Contoh",
      isLoading: false,
    });

    render(<TenantBrand mark />);

    // The school's colour and the label colour TenantProvider computed for
    // that fill, the same in both themes (white on the deep green, 5.3:1),
    // where the dark theme's accent label colour gave 3.05:1. Token
    // classes, not an inline style: the shared SchoolMark at 32px.
    const mark = screen.getByText(initialsFor("SMA Contoh"));
    expect(mark).toHaveClass("bg-(--tenant-accent)", "text-(--tenant-accent-fg)", "size-8");
    expect(mark).not.toHaveClass("text-accent-fg");
    expect(mark).not.toHaveAttribute("style");
  });

  it("omits the name and keeps only the mark for the collapsed sidebar rail", () => {
    mockUseTenant.mockReturnValue({
      branding: { logo_url: undefined },
      displayName: "SMA 1 Denpasar",
      isLoading: false,
    });

    render(<TenantBrand mark />);

    expect(screen.queryByText("SMA 1 Denpasar")).not.toBeInTheDocument();
    expect(screen.getByText(initialsFor("SMA 1 Denpasar"))).toBeInTheDocument();
  });
});
