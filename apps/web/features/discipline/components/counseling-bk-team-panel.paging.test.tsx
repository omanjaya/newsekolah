import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useBKTeamCounselingsQuery: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/discipline/counseling",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../reference/api", () => ({
  useLookup: () => new Map(),
}));
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([]);
});
vi.mock("../api-counseling-extras", () => ({
  useBKTeamCounselingsQuery: mocks.useBKTeamCounselingsQuery,
}));

import { CounselingBKTeamPanel } from "./counseling-bk-team-panel";

function notes(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `note-${index}`,
    title: `Note ${index}`,
    student_user_id: `student-${index}`,
    session_at: "2026-09-10T02:00:00Z",
    topic: "career",
  }));
}

describe("CounselingBKTeamPanel paging", () => {
  beforeEach(() => {
    mocks.useBKTeamCounselingsQuery.mockReset();
    mocks.useBKTeamCounselingsQuery.mockReturnValue({
      data: { data: notes(50) },
      isLoading: false,
    });
    window.history.replaceState(null, "", "/discipline/counseling");
  });

  it("requests the second page at offset 50 and keeps it in the URL", async () => {
    const user = userEvent.setup();
    render(<CounselingBKTeamPanel onOpen={vi.fn()} />);

    expect(mocks.useBKTeamCounselingsQuery).toHaveBeenLastCalledWith("", {
      limit: 50,
      offset: 0,
      search: "",
    });
    await user.click(screen.getByRole("button", { name: "next" }));

    expect(mocks.useBKTeamCounselingsQuery).toHaveBeenLastCalledWith("", {
      limit: 50,
      offset: 50,
      search: "",
    });
    expect(new URLSearchParams(window.location.search).get("team_page")).toBe("2");
  });

  it("returns to the first page when the topic filter changes", async () => {
    window.history.replaceState(null, "", "/discipline/counseling?team_page=3");
    const user = userEvent.setup();
    render(<CounselingBKTeamPanel onOpen={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "bkTeam.topicFilter" }));
    await user.click(await screen.findByRole("button", { name: "form.topicOptions.career" }));

    expect(mocks.useBKTeamCounselingsQuery).toHaveBeenLastCalledWith("career", {
      limit: 50,
      offset: 0,
      search: "",
    });
    expect(new URLSearchParams(window.location.search).get("team_page")).toBe("1");
  });

  it("sends the debounced search and returns to the first page", async () => {
    window.history.replaceState(null, "", "/discipline/counseling?team_page=3");
    const user = userEvent.setup();
    render(<CounselingBKTeamPanel onOpen={vi.fn()} />);

    await user.type(screen.getByRole("searchbox", { name: "searchPlaceholder" }), "bud");

    await waitFor(() => {
      expect(mocks.useBKTeamCounselingsQuery).toHaveBeenLastCalledWith("", {
        limit: 50,
        offset: 0,
        search: "bud",
      });
    });
    const params = new URLSearchParams(window.location.search);
    expect(params.get("team_q")).toBe("bud");
    expect(params.get("team_page")).toBe("1");
  });
});
