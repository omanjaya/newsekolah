import { render, screen } from "@testing-library/react";
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
  useDirectoryQuery: () => ({ data: { data: [] }, isLoading: false }),
  useLookup: () => new Map(),
}));
vi.mock("../api-counseling-extras", () => ({
  useBKTeamCounselingsQuery: mocks.useBKTeamCounselingsQuery,
}));

import { CounselingBKTeamPanel } from "./counseling-bk-team-panel";

describe("CounselingBKTeamPanel filters", () => {
  beforeEach(() => {
    mocks.useBKTeamCounselingsQuery.mockReset();
    mocks.useBKTeamCounselingsQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/discipline/counseling");
  });

  it("passes the chosen topic to the BK team query and writes it to the URL", async () => {
    const user = userEvent.setup();
    render(<CounselingBKTeamPanel onOpen={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "bkTeam.topicFilter" }));
    await user.click(await screen.findByRole("button", { name: "form.topicOptions.career" }));

    expect(mocks.useBKTeamCounselingsQuery).toHaveBeenLastCalledWith("career", {
      limit: 50,
      offset: 0,
      search: "",
    });
    expect(new URLSearchParams(window.location.search).get("topic")).toBe("career");
  });

  it("reads an initial topic URL param back into the filter bar", () => {
    window.history.replaceState(null, "", "/discipline/counseling?topic=social");
    render(<CounselingBKTeamPanel onOpen={vi.fn()} />);

    expect(mocks.useBKTeamCounselingsQuery).toHaveBeenLastCalledWith("social", {
      limit: 50,
      offset: 0,
      search: "",
    });
    expect(
      screen.getByRole("button", { name: "bkTeam.topicFilter: form.topicOptions.social" }),
    ).toBeInTheDocument();
  });

  it("clears an active filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/discipline/counseling?topic=other");
    const user = userEvent.setup();
    render(<CounselingBKTeamPanel onOpen={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "bkTeam.removeFilter" }));
    expect(mocks.useBKTeamCounselingsQuery).toHaveBeenLastCalledWith("", {
      limit: 50,
      offset: 0,
      search: "",
    });
    expect(new URLSearchParams(window.location.search).get("topic")).toBe("");
  });
});
