import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DutyPermissionGroups, type PermissionGroup } from "./duty-permission-groups";

vi.mock("next-intl", () => ({
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
}));
vi.mock("../../roles/lib/use-permission-text", () => ({
  usePermissionText: () => (code: string, description?: string) => ({
    label: `label:${code}`,
    description: description ?? "",
  }),
}));

afterEach(cleanup);

const GROUPS: PermissionGroup[] = [
  {
    name: "academic",
    permissions: [
      { code: "view_academic_data", description: "Read classes" },
      { code: "manage_master_data", description: "Edit master data" },
    ],
  },
  { name: "access", permissions: [{ code: "issue_scan_tokens", description: "Show a QR" }] },
];

describe("DutyPermissionGroups", () => {
  it("lists only what the duty grants for a reader who cannot change it, and says who can", () => {
    render(
      <DutyPermissionGroups
        groups={GROUPS}
        granted={new Set(["view_academic_data"])}
        canManage={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByText("permissionsReadOnly")).toBeInTheDocument();
    expect(screen.getByText("label:view_academic_data")).toBeInTheDocument();
    expect(screen.queryByText("label:manage_master_data")).not.toBeInTheDocument();
    // A group with nothing granted is left out.
    expect(screen.getByRole("heading", { name: "academic" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "access" })).not.toBeInTheDocument();
  });

  it("says when the duty grants nothing extra", () => {
    render(
      <DutyPermissionGroups
        groups={GROUPS}
        granted={new Set()}
        canManage={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("noPermissions")).toBeInTheDocument();
  });

  it("gives a manager every permission as a labelled checkbox group", () => {
    render(
      <DutyPermissionGroups
        groups={GROUPS}
        granted={new Set(["issue_scan_tokens"])}
        canManage
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.getByRole("group", { name: "access" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /label:issue_scan_tokens/ })).toBeChecked();
  });
});
