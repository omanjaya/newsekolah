import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useUsersQuery: vi.fn(),
  canCreate: true,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/school/users",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => mocks.canCreate,
  useSession: () => ({ me: { id: "me" } }),
}));
vi.mock("../../../lib/view-state/view-state-provider", () => ({
  useRememberedViewState: () => ["", vi.fn()],
}));
vi.mock("../../academic/components/academic-workspace-links", () => ({
  AcademicWorkspaceLinks: () => null,
}));
vi.mock("../api", () => ({
  useUsersQuery: mocks.useUsersQuery,
  useArchiveUserMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useResetPasswordMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useRolesQuery: () => ({
    data: {
      data: [
        { id: "role-teacher", slug: "teacher", name: "Guru" },
        { id: "role-librarian", slug: "librarian", name: "Pustakawan" },
      ],
    },
    isLoading: false,
  }),
}));
vi.mock("../duties-api", () => ({
  useImpersonateUserMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { UsersView } from "./users-view";

describe("UsersView filters", () => {
  beforeEach(() => {
    mocks.canCreate = true;
    mocks.useUsersQuery.mockReset();
    mocks.useUsersQuery.mockReturnValue({
      data: { data: [] },
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    window.history.replaceState(null, "", "/school/users");
  });

  it("passes the chosen kind to the users query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<UsersView />);

    await user.click(screen.getByRole("button", { name: "filters.kind" }));
    await user.click(await screen.findByRole("button", { name: "kinds.teacher" }));

    expect(mocks.useUsersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ profile_kind: "teacher" }),
    );
    expect(new URLSearchParams(window.location.search).get("kind")).toBe("teacher");
  });

  it("passes the chosen status to the users query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<UsersView />);

    await user.click(screen.getByRole("button", { name: "filters.status" }));
    await user.click(await screen.findByRole("button", { name: "status.invited" }));

    expect(mocks.useUsersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "invited" }),
    );
    expect(new URLSearchParams(window.location.search).get("status")).toBe("invited");
  });

  it("passes the chosen role to the users query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<UsersView />);

    await user.click(screen.getByRole("button", { name: "filters.role" }));
    await user.click(await screen.findByRole("button", { name: "Pustakawan" }));

    expect(mocks.useUsersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ role: "librarian" }),
    );
    expect(new URLSearchParams(window.location.search).get("role")).toBe("librarian");
  });

  it("toggles the include-archived filter directly and writes include_archived=true to the URL", async () => {
    const user = userEvent.setup();
    render(<UsersView />);

    const toggle = screen.getByRole("button", { name: "includeArchived" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);

    expect(mocks.useUsersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ include_archived: true }),
    );
    expect(new URLSearchParams(window.location.search).get("include_archived")).toBe("true");
  });

  it("reads an initial status=active URL param back into the filter bar", () => {
    window.history.replaceState(null, "", "/school/users?status=active");
    render(<UsersView />);

    expect(mocks.useUsersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "active" }),
    );
    expect(
      screen.getByRole("button", { name: "filters.status: status.active" }),
    ).toBeInTheDocument();
  });

  it("clears an active filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/school/users?kind=student");
    const user = userEvent.setup();
    render(<UsersView />);

    await user.click(screen.getByRole("button", { name: "filters.removeFilter" }));
    expect(mocks.useUsersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ profile_kind: undefined }),
    );
    expect(new URLSearchParams(window.location.search).get("kind")).toBe("");
  });
});
