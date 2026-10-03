import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useSPCandidatesQuery: vi.fn(),
  canIssue: true,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/discipline/at-risk",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => mocks.canIssue }));
vi.mock("../../../lib/view-state/view-state-provider", () => ({
  useRememberedViewState: () => ["", vi.fn()],
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({
    data: {
      data: [
        { id: "class-7a", name: "7A" },
        { id: "class-7b", name: "7B" },
      ],
    },
    isLoading: false,
  }),
}));
vi.mock("../api", () => ({
  useDisciplinePolicyQuery: () => ({
    data: {
      levels: [
        { level: 1, label: "SP1", min_points: 25 },
        { level: 2, label: "SP2", min_points: 50 },
      ],
    },
    isLoading: false,
  }),
  useIssueWarningLetterMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useSPCandidatesQuery: mocks.useSPCandidatesQuery,
}));

import { AtRiskPanel } from "./at-risk-panel";

describe("AtRiskPanel filters", () => {
  beforeEach(() => {
    mocks.canIssue = true;
    mocks.useSPCandidatesQuery.mockReset();
    mocks.useSPCandidatesQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    window.history.replaceState(null, "", "/discipline/at-risk");
  });

  it("passes the chosen class to the candidates query and writes class_id to the URL", async () => {
    const user = userEvent.setup();
    render(<AtRiskPanel />);

    await user.click(screen.getByRole("button", { name: "filters.class" }));
    await user.click(await screen.findByRole("button", { name: "7B" }));

    expect(mocks.useSPCandidatesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ classId: "class-7b" }),
    );
    expect(new URLSearchParams(window.location.search).get("class_id")).toBe("class-7b");
  });

  it("passes the chosen level to the candidates query and writes level to the URL", async () => {
    const user = userEvent.setup();
    render(<AtRiskPanel />);

    await user.click(screen.getByRole("button", { name: "filters.level" }));
    await user.click(await screen.findByRole("button", { name: "SP2" }));

    expect(mocks.useSPCandidatesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ level: "2" }),
    );
    expect(new URLSearchParams(window.location.search).get("level")).toBe("2");
  });

  it("reads an initial class_id URL param back into the filter bar", () => {
    window.history.replaceState(null, "", "/discipline/at-risk?class_id=class-7a");
    render(<AtRiskPanel />);

    expect(mocks.useSPCandidatesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ classId: "class-7a" }),
    );
    expect(screen.getByRole("button", { name: "filters.class: 7A" })).toBeInTheDocument();
  });

  it("clears an active filter from its chip's remove control", async () => {
    window.history.replaceState(null, "", "/discipline/at-risk?class_id=class-7a");
    const user = userEvent.setup();
    render(<AtRiskPanel />);

    await user.click(screen.getByRole("button", { name: "filters.removeFilter" }));
    expect(mocks.useSPCandidatesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ classId: "" }),
    );
    expect(new URLSearchParams(window.location.search).get("class_id")).toBe("");
  });
});
