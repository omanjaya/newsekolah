import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { getMessages } from "../lib/i18n/get-messages";

import { BrandedLoading } from "./branded-loading";

interface TenantHookResult {
  branding: { logo_url?: string } | undefined;
  displayName: string;
  isLoading: boolean;
}

const mockUseTenant = vi.fn<() => TenantHookResult>();

vi.mock("../lib/tenant/tenant-provider", () => ({
  useTenant: () => mockUseTenant(),
}));

function renderLoading() {
  return render(
    <NextIntlClientProvider locale="id" messages={getMessages("id") as never}>
      <BrandedLoading />
    </NextIntlClientProvider>,
  );
}

describe("BrandedLoading", () => {
  it("fills the screen with the school's mark and name, announced as loading", () => {
    mockUseTenant.mockReturnValue({
      branding: { logo_url: undefined },
      displayName: "SMA Contoh",
      isLoading: false,
    });
    renderLoading();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveClass("min-h-dvh");
    expect(status).toHaveTextContent("Memuat");
    expect(screen.getByText("SMA Contoh")).toHaveClass("text-title");
    expect(screen.getByText("SC")).toBeInTheDocument();
  });

  it("holds the school's place with skeletons, never the product name", () => {
    mockUseTenant.mockReturnValue({ branding: undefined, displayName: "SION", isLoading: true });
    const { container } = renderLoading();
    expect(screen.queryByText("SION")).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2);
  });

  it("waits before fading in, so a fast load shows no flash", () => {
    mockUseTenant.mockReturnValue({ branding: undefined, displayName: "", isLoading: true });
    renderLoading();
    expect(screen.getByRole("status")).toHaveClass(
      "animate-fade-in",
      "[animation-delay:var(--duration-base)]",
    );
  });
});
