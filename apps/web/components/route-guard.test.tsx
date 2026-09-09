import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
      me: { must_change_password: false, permissions: [] } as never,
      isReady: true,
    });

    render(
      <RouteGuard requiredPermission="library.manage">
        <p>protected</p>
      </RouteGuard>,
    );

    expect(screen.queryByText("protected")).not.toBeInTheDocument();
  });
});
