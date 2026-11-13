import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RolesView, slugFromName } from "./roles-view";

const rolesQuery = vi.fn<() => unknown>();
const permissionsQuery = vi.fn<() => unknown>();
const can = vi.fn(() => true);

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
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
  useReplaceRolePermissionsMutation: () => ({ mutate: vi.fn(), isPending: false }),
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
  });
});
