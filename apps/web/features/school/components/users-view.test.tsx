import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useUsersQuery: vi.fn(),
  canCreate: true,
  archiveMutate: vi.fn(),
  archiveMutateAsync: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${Object.values(params).join(",")}` : key,
}));
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
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../api", () => ({
  useUsersQuery: mocks.useUsersQuery,
  useArchiveUserMutation: () => ({
    mutate: mocks.archiveMutate,
    mutateAsync: mocks.archiveMutateAsync,
    isPending: false,
  }),
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

import type { AdminUser } from "../api";

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

    await user.click(screen.getByRole("button", { name: /^Hapus filter / }));
    expect(mocks.useUsersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ profile_kind: undefined }),
    );
    expect(new URLSearchParams(window.location.search).get("kind")).toBeNull();
  });
});

describe("UsersView density", () => {
  // The toolbar leaves density out over an empty, unfiltered list (f7a9488e:
  // nothing to arrange), so the list holds one account.
  const account: AdminUser = {
    id: "user-1",
    username: "siti",
    name: "Siti Rahma",
    status: "active",
    profile_kind: "teacher",
    must_change_password: false,
    created_at: "2026-07-01T00:00:00Z",
    roles: [{ id: "role-teacher", slug: "teacher", name: "Guru", is_primary: true }],
  };

  beforeEach(() => {
    mocks.canCreate = true;
    mocks.useUsersQuery.mockReset();
    mocks.useUsersQuery.mockReturnValue({
      data: { data: [account] },
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    window.history.replaceState(null, "", "/school/users");
  });

  it("starts the long list compact and still lets the toolbar open it up", async () => {
    const user = userEvent.setup();
    render(<UsersView />);

    // The compact 40px row puts the name and the username on one line.
    const nameLine = () => within(screen.getByRole("table")).getByText("Siti Rahma").parentElement;
    const toggle = screen.getByRole("button", { name: /^Kepadatan/ });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(nameLine()).toHaveClass("md:flex-row");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: /^Kepadatan/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(nameLine()).not.toHaveClass("md:flex-row");
  });
});

describe("UsersView archive", () => {
  const account: AdminUser = {
    id: "user-1",
    username: "ujiarsip16",
    name: "Uji Arsip Enambelas",
    status: "active",
    profile_kind: "staff",
    must_change_password: false,
    created_at: "2026-07-01T00:00:00Z",
    roles: [{ id: "role-staff", slug: "staff", name: "Pegawai", is_primary: true }],
  };

  beforeEach(() => {
    mocks.canCreate = true;
    mocks.archiveMutate.mockReset();
    mocks.archiveMutateAsync.mockReset().mockResolvedValue(undefined);
    mocks.useUsersQuery.mockReset();
    window.history.replaceState(null, "", "/school/users");
  });

  /** The row's action menu; the table and its phone cards both carry one. */
  function rowMenu(): HTMLElement {
    const [menu] = screen.getAllByRole("button", { name: "actions.menuFor:Uji Arsip Enambelas" });
    if (!menu) throw new Error("no row menu");
    return menu;
  }

  function showing(user: AdminUser) {
    mocks.useUsersQuery.mockReturnValue({
      data: { data: [user] },
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    });
  }

  // One misclick on Arsipkan used to cut a real teacher or student off at
  // once (POST .../archive with no dialog). It now asks first, naming who
  // loses access, and archives only on confirm.
  it("asks for confirmation naming the user before archiving", async () => {
    showing(account);
    const user = userEvent.setup();
    render(<UsersView />);

    await user.click(rowMenu());
    await user.click(await screen.findByRole("menuitem", { name: "actions.archive" }));

    expect(mocks.archiveMutate).not.toHaveBeenCalled();
    expect(mocks.archiveMutateAsync).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("actions.archiveTitle:Uji Arsip Enambelas"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("actions.archiveBody:Uji Arsip Enambelas")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "actions.archive" }));
    expect(mocks.archiveMutateAsync).toHaveBeenCalledWith({ id: "user-1", restore: false });
  });

  it("archives nothing when the confirmation is cancelled", async () => {
    showing(account);
    const user = userEvent.setup();
    render(<UsersView />);

    await user.click(rowMenu());
    await user.click(await screen.findByRole("menuitem", { name: "actions.archive" }));
    const dialog = await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    expect(dialog).not.toBeInTheDocument();
    expect(mocks.archiveMutate).not.toHaveBeenCalled();
    expect(mocks.archiveMutateAsync).not.toHaveBeenCalled();
  });

  it("restores an archived user straight away, the safe direction", async () => {
    showing({ ...account, status: "inactive", archived_at: "2026-11-20T00:00:00Z" } as AdminUser);
    const user = userEvent.setup();
    render(<UsersView />);

    await user.click(rowMenu());
    await user.click(await screen.findByRole("menuitem", { name: "actions.restore" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.archiveMutate).toHaveBeenCalledWith(
      { id: "user-1", restore: true },
      expect.any(Object),
    );
  });
});
