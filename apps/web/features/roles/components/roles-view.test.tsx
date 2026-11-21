import type * as UiModule from "@newsekolah/ui";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { slugFromName } from "./create-role-form";
import { RolesView } from "./roles-view";

const rolesQuery = vi.fn<() => unknown>();
const permissionsQuery = vi.fn<() => unknown>();
const can = vi.fn(() => true);
const replaceMutate = vi.fn((_vars: unknown, opts?: { onSuccess?: () => void }) => {
  opts?.onSuccess?.();
});

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../academic/components/academic-workspace-links", () => ({
  AcademicWorkspaceLinks: () => null,
}));
vi.mock("@newsekolah/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof UiModule>()),
  // The desktop layout: groups open, the role list beside the panel.
  useMediaQuery: () => true,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => () => "error",
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => can() }));
vi.mock("../api", () => ({
  useRolesQuery: () => rolesQuery() as never,
  usePermissionsQuery: () => permissionsQuery() as never,
  useCreateRoleMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRoleMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReplaceRolePermissionsMutation: () => ({ mutate: replaceMutate, isPending: false }),
}));

const roles = [
  { id: "r1", slug: "custom_a", name: "Custom A", is_system: false, permissions: ["view_x"] },
  { id: "r2", slug: "custom_b", name: "Custom B", is_system: false, permissions: [] },
];

beforeEach(() => {
  can.mockReturnValue(true);
  rolesQuery.mockReturnValue({ data: { data: roles }, isLoading: false, isError: false });
  permissionsQuery.mockReturnValue({
    data: {
      groups: [
        {
          name: "g",
          permissions: [
            { code: "view_x", description: "View x" },
            { code: "view_y", description: "View y" },
          ],
        },
      ],
    },
    isLoading: false,
    isError: false,
  });
});

afterEach(cleanup);

describe("slugFromName", () => {
  it("derives a full code from a multi-word name", () => {
    expect(slugFromName("Wali Asrama")).toBe("wali_asrama");
    expect(slugFromName("  Kepala  Lab! ")).toBe("kepala_lab");
  });
});

describe("RolesView", () => {
  it("keeps unsaved checkbox edits when switching roles and back", async () => {
    const user = userEvent.setup();
    render(<RolesView />);
    await user.click(screen.getByRole("checkbox", { name: /view_y/ }));
    expect(screen.getByRole("checkbox", { name: /view_y/ })).toBeChecked();

    await user.click(screen.getByRole("button", { name: /Custom B/ }));
    expect(screen.getByRole("checkbox", { name: /view_y/ })).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: /Custom A/ }));
    expect(screen.getByRole("checkbox", { name: /view_y/ })).toBeChecked();
  });

  it("keeps the saved boxes while the roles refetch is pending", async () => {
    const user = userEvent.setup();
    render(<RolesView />);
    await user.click(screen.getByRole("checkbox", { name: /view_y/ }));
    await user.click(screen.getByRole("button", { name: "save" }));
    // The roles list still holds the old set, as it does before the refetch lands.
    expect(screen.getByRole("checkbox", { name: /view_y/ })).toBeChecked();
    expect(screen.queryByText("unsavedRole")).not.toBeInTheDocument();

    // A toggle right after the save keeps the saved code.
    await user.click(screen.getByRole("checkbox", { name: /view_x/ }));
    await user.click(screen.getByRole("button", { name: "save" }));
    expect(replaceMutate).toHaveBeenLastCalledWith(
      { id: "r1", permissions: ["view_y"] },
      expect.anything(),
    );
  });

  it("marks the role, its group and the save bar while a change is unsaved", async () => {
    const user = userEvent.setup();
    render(<RolesView />);
    expect(screen.queryByText("unsavedRole")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /view_y/ }));
    expect(screen.getByText("unsavedRole")).toBeInTheDocument();
    // The role in the list and the group header both say "changed".
    expect(screen.getAllByText("changed")).toHaveLength(2);

    // Toggling back to the saved set is no change at all.
    await user.click(screen.getByRole("checkbox", { name: /view_y/ }));
    expect(screen.queryByText("unsavedRole")).not.toBeInTheDocument();
  });

  it("discards the selected role's unsaved change", async () => {
    const user = userEvent.setup();
    render(<RolesView />);
    await user.click(screen.getByRole("checkbox", { name: /view_y/ }));
    const [discard] = screen.getAllByRole("button", { name: "discard" });
    if (discard) await user.click(discard);
    expect(screen.getByRole("checkbox", { name: /view_y/ })).not.toBeChecked();
    expect(screen.queryByText("unsavedRole")).not.toBeInTheDocument();
  });

  it("filters permissions by search and grants a whole group at once", async () => {
    const user = userEvent.setup();
    render(<RolesView />);
    await user.type(screen.getByRole("searchbox", { name: "searchLabel" }), "view y");
    expect(screen.queryByRole("checkbox", { name: /view_x/ })).not.toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox", { name: "searchLabel" }));
    await user.click(screen.getByRole("checkbox", { name: "selectAll" }));
    expect(screen.getByRole("checkbox", { name: /view_x/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /view_y/ })).toBeChecked();
  });

  it("lays the permission search and scope out by the panel's width, not the screen's", () => {
    // Beside the role list from 768px the panel header is 176px wide, and
    // a row keyed to 640px of screen left the search a few pixels there.
    render(<RolesView />);
    const search = screen.getByRole("searchbox", { name: "searchLabel" });
    const bar = search.closest("[data-slot=filter-bar]");
    expect(bar).toHaveClass("@container/filter-bar");
    expect(bar).toContainElement(screen.getByRole("radiogroup", { name: "scopeLabel" }));
    expect(bar?.querySelector("[data-slot=filter-bar-row]")).toHaveClass(
      "@max-sm/filter-bar:*:w-full",
      "@sm/filter-bar:flex-row",
    );
  });

  it("shows a retryable error instead of an empty grid when roles fail to load", () => {
    rolesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(<RolesView />);
    expect(screen.getByRole("button", { name: "actions.retry" })).toBeInTheDocument();
  });

  it("does not invite a reader without manage rights to create a role", () => {
    can.mockReturnValue(false);
    rolesQuery.mockReturnValue({
      data: { data: [{ ...roles[0], is_system: true }] },
      isLoading: false,
      isError: false,
    });
    render(<RolesView />);
    expect(screen.getByText("systemHintReadOnly")).toBeInTheDocument();
    expect(screen.queryByText("systemHint")).not.toBeInTheDocument();
    // Says who can create a role, instead of a page with no way forward.
    expect(screen.getByText("readOnlyNotice")).toBeInTheDocument();
  });

  it("shows no read-only notice to a reader who can manage roles", () => {
    can.mockReturnValue(true);
    rolesQuery.mockReturnValue({
      data: { data: [{ ...roles[0], is_system: true }] },
      isLoading: false,
      isError: false,
    });
    render(<RolesView />);
    expect(screen.queryByText("readOnlyNotice")).not.toBeInTheDocument();
  });
});
