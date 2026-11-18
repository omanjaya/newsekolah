import type * as UiModule from "@newsekolah/ui";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useRoleTestingQuery,
  useRoleTestingSwitchMutation,
} from "../features/auth/role-testing-api";
import { ServerAccessCookieError } from "../lib/session/clear-server-access-cookie";

import { RoleTestingSwitcher } from "./role-testing-switcher";

const replace = vi.fn();
const mutateAsync = vi.fn();
const allowed = vi.fn(() => true);
const toastError = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../lib/session/session-provider", () => ({
  useSession: () => ({
    me: { id: "admin", name: "Superadmin", roles: [], tenant: { tenant_id: "school" } },
  }),
}));
vi.mock("../lib/navigation/use-unsaved-changes-protection", () => ({
  confirmUnsavedChangesBeforeNavigation: () => allowed(),
}));
vi.mock("../features/auth/role-testing-api", () => ({
  useRoleTestingQuery: vi.fn(),
  useRoleTestingSwitchMutation: vi.fn(),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ error: toastError, success: vi.fn() }) };
});

const mockedQuery = vi.mocked(useRoleTestingQuery);
const mockedSwitch = vi.mocked(useRoleTestingSwitchMutation);

beforeEach(() => {
  vi.clearAllMocks();
  mutateAsync.mockResolvedValue(undefined);
  allowed.mockReturnValue(true);
  mockedSwitch.mockReturnValue({ mutateAsync, isPending: false } as never);
  mockedQuery.mockImplementation(
    (filter) =>
      ({
        data: {
          available: true,
          active: false,
          roles: [{ slug: "teacher", name: "Guru" }],
          users: filter?.role
            ? [{ id: "teacher-1", username: "teacher.one", name: "Teacher One" }]
            : [],
        },
        isPending: false,
        isFetching: false,
        isError: false,
      }) as never,
  );
});

afterEach(cleanup);

describe("RoleTestingSwitcher", () => {
  it("does not expose controls when the server says role testing is unavailable", () => {
    mockedQuery.mockReturnValue({
      data: { available: false, active: false, roles: [], users: [] },
    } as never);
    render(<RoleTestingSwitcher />);
    expect(screen.queryByTestId("role-testing-switcher")).not.toBeInTheDocument();
  });

  it("switches only after an active account is selected and navigation is allowed", async () => {
    const user = userEvent.setup();
    render(<RoleTestingSwitcher />);
    await user.click(screen.getByRole("button", { name: "changeRole" }));
    expect(screen.getByTestId("role-testing-dialog")).toBeInTheDocument();
    expect(screen.getByText("permissionsNote")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Teacher One (teacher.one)" }));
    allowed.mockReturnValue(false);
    await user.click(screen.getByRole("button", { name: "switch" }));
    expect(mutateAsync).not.toHaveBeenCalled();

    allowed.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "switch" }));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({ userId: "teacher-1", role: "teacher" });
      expect(replace).toHaveBeenCalledWith("/dashboard");
    });
  });

  // The switch did not happen because the previous actor's server access
  // cookie could not be removed first: say so, not a generic failure.
  it("tells the superadmin when the switch could not be prepared", async () => {
    mutateAsync.mockRejectedValue(new ServerAccessCookieError());
    const user = userEvent.setup();
    render(<RoleTestingSwitcher />);
    await user.click(screen.getByRole("button", { name: "changeRole" }));
    await user.click(screen.getByRole("radio", { name: "Teacher One (teacher.one)" }));
    await user.click(screen.getByRole("button", { name: "switch" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("prepareFailed");
    });
    expect(replace).not.toHaveBeenCalled();
  });
});
