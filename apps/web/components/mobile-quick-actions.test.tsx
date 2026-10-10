import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  profileKind: "teacher",
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../lib/session/session-provider", () => ({
  useSession: () => ({
    me: { permissions: mocks.permissions, profile_kind: mocks.profileKind, roles: [] },
  }),
}));

import { MobileQuickActions } from "./mobile-quick-actions";

describe("MobileQuickActions", () => {
  beforeEach(() => {
    mocks.permissions = [];
    mocks.profileKind = "teacher";
  });

  it("opens a sheet listing the actions the reader may perform", () => {
    mocks.permissions = ["submit_leave_requests"];
    render(<MobileQuickActions />);

    fireEvent.click(screen.getByRole("button", { name: "trigger" }));

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "actions.submitLeave",
      "actions.checkIn",
      "actions.scanQr",
    ]);
    expect(links[0]).toHaveAttribute(
      "href",
      "/leave-requests?type=leave&tab=mine&quick=submit-leave",
    );
  });

  it("closes the sheet after choosing an action", () => {
    render(<MobileQuickActions />);
    fireEvent.click(screen.getByRole("button", { name: "trigger" }));

    fireEvent.click(screen.getByRole("link", { name: "actions.scanQr" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders no button when the reader has no quick action", () => {
    // Scan and check-in are scoped to known profile kinds, so a session
    // without one is offered nothing.
    mocks.profileKind = undefined as unknown as "student";
    const { container } = render(<MobileQuickActions />);

    expect(container).toBeEmptyDOMElement();
  });
});
