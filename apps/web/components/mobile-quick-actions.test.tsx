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
    // Most frequent first: scanning, clocking in, then the occasional request.
    expect(links.map((link) => link.textContent)).toEqual([
      "actions.scanQr",
      "actions.checkIn",
      "actions.submitLeave",
    ]);
    expect(links[2]).toHaveAttribute(
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

  it("sits in the tab bar as the raised centre button, with a short label under it", () => {
    render(<MobileQuickActions />);

    const trigger = screen.getByRole("button", { name: "trigger" });
    // No longer a floating button over the page: it lives in the bar's slot.
    expect(trigger).not.toHaveClass("fixed");
    expect(trigger).toHaveTextContent("label");
    expect(trigger.querySelector("[data-tab-centre]")).toBeInTheDocument();
  });

  it("renders no button when the reader has no quick action", () => {
    // Scan and check-in are scoped to known profile kinds, so a session
    // without one is offered nothing.
    mocks.profileKind = undefined as unknown as "student";
    const { container } = render(<MobileQuickActions />);

    expect(container).toBeEmptyDOMElement();
  });
});
