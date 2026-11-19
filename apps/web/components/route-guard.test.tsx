import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { markAuthRedirect } from "../lib/session/auth-redirect-flag";
import { useSession } from "../lib/session/session-provider";

import { RouteGuard } from "./route-guard";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/dashboard",
}));

vi.mock("../lib/session/session-provider", () => ({
  useSession: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockedUseSession = vi.mocked(useSession);

describe("RouteGuard", () => {
  it("redirects to /login when the session is anonymous", () => {
    mockedUseSession.mockReturnValue({ status: "anonymous", me: undefined, isReady: true });

    render(
      <RouteGuard>
        <p>protected</p>
      </RouteGuard>,
    );

    expect(replace).toHaveBeenCalledWith("/login?next=%2Fdashboard");
    expect(screen.queryByText("protected")).not.toBeInTheDocument();
  });

  // A link clicked as the session ended can win the race against the
  // session-ended redirect; this page then sends the reader to sign-in and
  // must keep the notice (audit r3-n9).
  it("keeps the session-ended reason while that redirect is under way", () => {
    try {
      markAuthRedirect({ sessionEnded: true });
      mockedUseSession.mockReturnValue({ status: "anonymous", me: undefined, isReady: true });

      render(
        <RouteGuard>
          <p>protected</p>
        </RouteGuard>,
      );

      expect(replace).toHaveBeenLastCalledWith("/login?next=%2Fdashboard&reason=session-ended");
    } finally {
      // Leaves a redirect with no reason, so the other cases see none.
      markAuthRedirect();
    }
  });

  it("redirects to /change-password when must_change_password is set", () => {
    mockedUseSession.mockReturnValue({
      status: "authenticated",
      me: { must_change_password: true, permissions: [] } as never,
      isReady: true,
    });

    render(
      <RouteGuard>
        <p>protected</p>
      </RouteGuard>,
    );

    expect(replace).toHaveBeenCalledWith("/change-password");
  });

  it("renders children once authenticated with the required permission", () => {
    mockedUseSession.mockReturnValue({
      status: "authenticated",
      me: { must_change_password: false, permissions: ["library.manage"] } as never,
      isReady: true,
    });

    render(
      <RouteGuard requiredPermission="library.manage">
        <p>protected</p>
      </RouteGuard>,
    );

    expect(screen.getByText("protected")).toBeInTheDocument();
  });

  it("shows the forbidden page when the required permission is missing", () => {
    mockedUseSession.mockReturnValue({
      status: "authenticated",
      me: { must_change_password: false, permissions: [], roles: [] } as never,
      isReady: true,
    });

    render(
      <RouteGuard requiredPermission="library.manage">
        <p>protected</p>
      </RouteGuard>,
    );

    expect(screen.queryByText("protected")).not.toBeInTheDocument();
    // The shell's state, with the way home marked by its house.
    expect(screen.getByRole("heading", { level: 1, name: "title" })).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "backHome" }).querySelector("svg.lucide-house"),
    ).not.toBeNull();
  });

  it("says a platform operator's page is theirs alone, instead of sending the reader to the school admin", () => {
    mockedUseSession.mockReturnValue({
      status: "authenticated",
      me: { must_change_password: false, permissions: [], roles: [{ slug: "admin" }] } as never,
      isReady: true,
    });

    render(
      <RouteGuard requiredPermission="platform_superadmin">
        <p>protected</p>
      </RouteGuard>,
    );

    expect(screen.getByText("platformBody")).toBeInTheDocument();
    expect(screen.queryByText("body")).not.toBeInTheDocument();
  });

  it("lets in a reader holding any one of the alternative permissions", () => {
    mockedUseSession.mockReturnValue({
      status: "authenticated",
      me: { must_change_password: false, permissions: ["view_own_supervision"] } as never,
      isReady: true,
    });

    render(
      <RouteGuard anyPermission={["view_supervision", "view_own_supervision"]}>
        <p>protected</p>
      </RouteGuard>,
    );

    expect(screen.getByText("protected")).toBeInTheDocument();
  });

  it("refuses a reader holding none of the alternative permissions", () => {
    mockedUseSession.mockReturnValue({
      status: "authenticated",
      me: { must_change_password: false, permissions: ["view_dashboard"], roles: [] } as never,
      isReady: true,
    });

    render(
      <RouteGuard anyPermission={["view_supervision", "view_own_supervision"]}>
        <p>protected</p>
      </RouteGuard>,
    );

    expect(screen.queryByText("protected")).not.toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });
});
