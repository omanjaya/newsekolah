import { cleanup, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublicSiteFrame } from "./public-site-frame";

interface TenantHookResult {
  branding: { disabled_public_modules?: string[] } | undefined;
  displayName: string;
  isLoading: boolean;
}

const tenant = vi.fn<() => TenantHookResult>();
const session = vi.fn<() => { status: string; isReady: boolean }>();
const pathname = vi.fn(() => "/verify/ABC");

vi.mock("../lib/tenant/tenant-provider", () => ({ useTenant: () => tenant() }));
vi.mock("../lib/session/session-provider", () => ({ useSession: () => session() }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
}));

function renderFrame() {
  render(
    <PublicSiteFrame>
      <h1>page</h1>
    </PublicSiteFrame>,
  );
  return screen.getByRole("banner");
}

describe("PublicSiteFrame", () => {
  beforeEach(() => {
    tenant.mockReturnValue({
      branding: { disabled_public_modules: [] },
      displayName: "SMA 1 Denpasar",
      isLoading: false,
    });
    session.mockReturnValue({ status: "anonymous", isReady: true });
    pathname.mockReturnValue("/verify/ABC");
  });

  it("puts the school's name in the header and the footer around the page", () => {
    const header = renderFrame();
    expect(within(header).getByText("SMA 1 Denpasar")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("page");
    expect(screen.getByRole("contentinfo")).toHaveTextContent("SMA 1 Denpasar");
  });

  it("offers sign-in to a visitor and home to someone signed in", () => {
    renderFrame();
    expect(screen.getByRole("link", { name: "signIn" })).toHaveAttribute("href", "/login");

    cleanup();
    session.mockReturnValue({ status: "authenticated", isReady: true });
    renderFrame();
    expect(screen.getByRole("link", { name: "toDashboard" })).toHaveAttribute("href", "/dashboard");
  });

  it("links the catalogue while the library is on, marked current on its pages", () => {
    pathname.mockReturnValue("/opac/123");
    renderFrame();
    expect(screen.getByRole("link", { name: "catalogue" })).toHaveAttribute("aria-current", "page");
  });

  it("drops the catalogue link while the school has the library off", () => {
    tenant.mockReturnValue({
      branding: { disabled_public_modules: ["library"] },
      displayName: "SMA 1 Denpasar",
      isLoading: false,
    });
    renderFrame();
    expect(screen.queryByRole("link", { name: "catalogue" })).not.toBeInTheDocument();
  });

  it("names nobody while branding loads, never the platform", () => {
    tenant.mockReturnValue({ branding: undefined, displayName: "SION", isLoading: true });
    renderFrame();
    expect(screen.queryByText(/SION/)).not.toBeInTheDocument();
  });
});
