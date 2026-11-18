import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ChangePasswordPage from "./page";

const replace = vi.fn();
const logout = vi.fn(() => Promise.resolve());
const session = vi.fn<() => unknown>();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => session() as never,
}));
vi.mock("../../../features/auth/api", () => ({
  useLogoutMutation: () => ({ mutateAsync: logout, isPending: false }),
}));
vi.mock("../../../features/auth/components/change-password-form", () => ({
  ChangePasswordForm: () => <form aria-label="form" />,
}));

afterEach(() => {
  cleanup();
  replace.mockReset();
  logout.mockClear();
});

describe("ChangePasswordPage", () => {
  it("shows a placeholder, not an empty card, while the session is not ready", () => {
    session.mockReturnValue({ status: "loading", me: undefined, isReady: false });
    const { container } = render(<ChangePasswordPage />);
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
  });

  it("lets a forced-change user sign out instead of trapping them", async () => {
    session.mockReturnValue({
      status: "authenticated",
      me: { must_change_password: true },
      isReady: true,
    });
    const user = userEvent.setup();
    render(<ChangePasswordPage />);
    await user.click(screen.getByRole("button", { name: "logout" }));
    expect(logout).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/login");
  });
});
