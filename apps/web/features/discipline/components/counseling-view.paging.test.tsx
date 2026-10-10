import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useMyCounselingsQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/discipline/counseling",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => false }));
vi.mock("../../reference/api", () => ({
  useDirectoryQuery: () => ({ data: { data: [] }, isLoading: false }),
  useLookup: () => new Map(),
}));
vi.mock("../../student-services/components/service-workspace-nav", () => ({
  CounselingWorkspaceNav: () => null,
}));
vi.mock("../api-counseling-extras", () => ({
  useMyCounselingsQuery: mocks.useMyCounselingsQuery,
  useDeleteCounselingMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("./counseling-bk-team-panel", () => ({ CounselingBKTeamPanel: () => null }));
vi.mock("./counseling-detail-dialog", () => ({ CounselingDetailDialog: () => null }));
vi.mock("./counseling-form", () => ({ CounselingForm: () => null }));

import { CounselingView } from "./counseling-view";

function notes(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `note-${index}`,
    title: `Note ${index}`,
    student_user_id: `student-${index}`,
    session_at: "2026-09-10T02:00:00Z",
    kind: "individual",
  }));
}

describe("CounselingView paging", () => {
  beforeEach(() => {
    mocks.useMyCounselingsQuery.mockReset();
    mocks.useMyCounselingsQuery.mockReturnValue({ data: { data: notes(50) }, isLoading: false });
    window.history.replaceState(null, "", "/discipline/counseling");
  });

  it("requests the second page at offset 50 and keeps it in the URL", async () => {
    const user = userEvent.setup();
    render(<CounselingView />);

    expect(mocks.useMyCounselingsQuery).toHaveBeenLastCalledWith({ limit: 50, offset: 0 });
    await user.click(screen.getByRole("button", { name: "next" }));

    expect(mocks.useMyCounselingsQuery).toHaveBeenLastCalledWith({ limit: 50, offset: 50 });
    expect(new URLSearchParams(window.location.search).get("mine_page")).toBe("2");
  });
});
