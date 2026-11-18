import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryLoan } from "../api";

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) => permissions.granted.has(permission),
}));
vi.mock("../use-tenant-timezone", () => ({ useTenantTimeZone: () => "Asia/Jakarta" }));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([{ id: "u1", name: "Siswa Contoh" }]);
});
vi.mock("./library-title-name", () => ({
  LibraryTitleName: ({ titleId }: { titleId: string }) => <>{`title ${titleId}`}</>,
}));

import { DashboardActivityLists } from "./dashboard-activity-lists";

function loan(id: string, patch: Partial<LibraryLoan> = {}): LibraryLoan {
  return {
    id,
    copy_id: `copy-${id}`,
    title_id: `t-${id}`,
    member_user_id: "u1",
    borrowed_at: "2026-09-25T00:00:00Z",
    due_on: "2026-10-01",
    renewal_count: 0,
    status: "active",
    fine_amount: 0,
    ...patch,
  };
}

function renderLists() {
  render(
    <DashboardActivityLists
      latestLoans={[loan("a")]}
      longestOverdue={[loan("b")]}
      popularTitles={[]}
    />,
  );
}

describe("DashboardActivityLists", () => {
  beforeEach(() => {
    permissions.granted = new Set();
  });

  it("links borrowers and the desk for a librarian", () => {
    permissions.granted = new Set(["manage_library_circulation", "manage_library_members"]);
    renderLists();

    const memberLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === "/library/members/u1");
    expect(memberLinks).toHaveLength(2);
    expect(screen.getByRole("link", { name: "followUpAll" })).toHaveAttribute(
      "href",
      "/library/desk#desk-overdue",
    );
  });

  // A headmaster reads the dashboard through view_library_reports but can
  // open neither the desk nor a member's page: no dead links.
  it("shows plain rows to a reader without circulation or member rights", () => {
    renderLists();

    expect(screen.getByText("title t-a")).toBeInTheDocument();
    expect(screen.getByText("title t-b")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
