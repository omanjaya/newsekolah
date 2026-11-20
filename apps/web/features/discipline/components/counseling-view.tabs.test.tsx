import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useMyCounselingsQuery: vi.fn(),
  me: {
    permissions: [] as string[],
    roles: [] as { id: string; slug: string; name: string; is_primary: boolean }[],
    duties: [] as { slug: string; scope_kind: "school" }[],
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/discipline/counseling",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: mocks.me }),
}));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([]);
});
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../api-counseling-extras", () => ({
  useMyCounselingsQuery: mocks.useMyCounselingsQuery,
  useDeleteCounselingMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("./counseling-bk-team-panel", () => ({
  CounselingBKTeamPanel: () => <p>bk-team-panel</p>,
}));
vi.mock("./counseling-leadership-panel", () => ({
  CounselingLeadershipPanel: () => <p>leadership-panel</p>,
}));
vi.mock("./counseling-detail-dialog", () => ({ CounselingDetailDialog: () => null }));
vi.mock("./counseling-form", () => ({ CounselingForm: () => null }));

import { CounselingView } from "./counseling-view";

const role = (slug: string) => ({ id: slug, slug, name: slug, is_primary: true });

describe("CounselingView lists by reader", () => {
  beforeEach(() => {
    mocks.useMyCounselingsQuery.mockReset();
    mocks.useMyCounselingsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/discipline/counseling");
  });

  it("gives a duty counselor both their notes and the BK team's", () => {
    mocks.me = {
      permissions: ["manage_counseling"],
      roles: [role("teacher")],
      duties: [{ slug: "counselor", scope_kind: "school" }],
    };
    render(<CounselingView />);

    expect(screen.getByRole("tab", { name: "tabs.mine" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "tabs.bkTeam" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "tabs.leadership" })).not.toBeInTheDocument();
  });

  // The admin holds manage_counseling but not the counselor duty: the
  // "Tim BK" list would only ever answer COUNSELING_FORBIDDEN.
  it("hides the BK team list from an admin, even on a deep link", () => {
    mocks.me = {
      permissions: ["manage_counseling", "view_counseling"],
      roles: [role("admin")],
      duties: [],
    };
    window.history.replaceState(null, "", "/discipline/counseling?tab=bkTeam");
    render(<CounselingView />);

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByText("bk-team-panel")).not.toBeInTheDocument();
    expect(mocks.useMyCounselingsQuery).toHaveBeenLastCalledWith(expect.any(Object), true);
  });

  it("shows the principal the notes shared with leadership, and never asks for own notes", () => {
    mocks.me = { permissions: ["view_counseling"], roles: [role("principal")], duties: [] };
    render(<CounselingView />);

    expect(screen.getByText("leadership-panel")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(mocks.useMyCounselingsQuery).toHaveBeenLastCalledWith(expect.any(Object), false);
    expect(screen.queryByRole("button", { name: "add" })).not.toBeInTheDocument();
  });
});
