import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useSPCandidatesQuery: vi.fn(),
  issue: vi.fn(),
  canIssue: true,
  canManage: true,
  policy: {},
}));

const POLICY_OK = {
  data: {
    levels: [
      { level: 1, label: "SP1", min_points: 25 },
      { level: 2, label: "SP2", min_points: 50 },
    ],
  },
  isLoading: false,
  isSuccess: true,
  isError: false,
};

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/discipline/at-risk",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string) =>
    permission === "manage_settings" ? mocks.canManage : mocks.canIssue,
}));
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
  useDisciplinePolicyQuery: () => mocks.policy,
  useIssueWarningLetterMutation: () => ({ mutate: mocks.issue, isPending: false }),
  useSPCandidatesQuery: mocks.useSPCandidatesQuery,
}));

import { AtRiskPanel } from "./at-risk-panel";

describe("AtRiskPanel filters", () => {
  beforeEach(() => {
    mocks.canIssue = true;
    mocks.policy = POLICY_OK;
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

    await user.click(screen.getByRole("button", { name: /^Hapus filter / }));
    expect(mocks.useSPCandidatesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ classId: "" }),
    );
    expect(new URLSearchParams(window.location.search).get("class_id")).toBeNull();
  });
});

function candidate(id: string, name: string) {
  return {
    student_user_id: id,
    student_name: name,
    nis: "1001",
    class_name: "7A",
    total_points: 30,
    issued_levels: [],
  };
}

describe("AtRiskPanel states and issuing", () => {
  beforeEach(() => {
    mocks.canIssue = true;
    mocks.canManage = true;
    mocks.policy = POLICY_OK;
    mocks.issue.mockReset();
    mocks.useSPCandidatesQuery.mockReset();
    window.history.replaceState(null, "", "/discipline/at-risk");
  });

  it("shows a load failure with a retry instead of an empty all-clear", async () => {
    const refetch = vi.fn();
    mocks.useSPCandidatesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("boom"),
      refetch,
    });
    const user = userEvent.setup();
    render(<AtRiskPanel />);

    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("alert")).getByRole("button"));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the filtered empty state, not the first-use one, while a filter is set", () => {
    window.history.replaceState(null, "", "/discipline/at-risk?class_id=class-7a");
    mocks.useSPCandidatesQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    render(<AtRiskPanel />);

    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });

  it("asks before issuing a letter and issues only for the confirmed student", async () => {
    mocks.useSPCandidatesQuery.mockReturnValue({
      data: { data: [candidate("s1", "Ayu"), candidate("s2", "Budi")] },
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<AtRiskPanel />);

    expect(screen.queryByRole("link", { name: "Ayu" })).not.toBeInTheDocument();
    expect(screen.getAllByText("pointsValue")).not.toHaveLength(0);

    // The table and the phone card list both render; act on the table row.
    const budiRow = screen
      .getAllByText("Budi")
      .map((cell) => cell.closest("tr"))
      .find((row) => row !== null);
    expect(budiRow).toBeDefined();
    await user.click(within(budiRow as HTMLElement).getByRole("button", { name: "issue" }));
    expect(mocks.issue).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "issue" }));
    expect(mocks.issue).toHaveBeenCalledWith(
      { student_user_id: "s2", level: 1 },
      expect.any(Object),
    );
  });

  it("keeps the confirm dialog open when issuing fails, so it can be retried", async () => {
    mocks.useSPCandidatesQuery.mockReturnValue({
      data: { data: [candidate("s1", "Ayu")] },
      isLoading: false,
    });
    mocks.issue.mockImplementation(
      (_vars, options: { onError?: (e: Error) => void; onSettled?: () => void }) => {
        options.onError?.(new Error("boom"));
        options.onSettled?.();
      },
    );
    const user = userEvent.setup();
    render(<AtRiskPanel />);

    const row = screen
      .getAllByText("Ayu")
      .map((cell) => cell.closest("tr"))
      .find((r) => r !== null);
    await user.click(within(row as HTMLElement).getByRole("button", { name: "issue" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "issue" }));

    expect(mocks.issue).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows a policy load failure with a retry, not the no-policy notice", async () => {
    const refetch = vi.fn();
    mocks.policy = {
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: true,
      error: new Error("boom"),
      refetch,
    };
    mocks.useSPCandidatesQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    const user = userEvent.setup();
    render(<AtRiskPanel />);

    expect(screen.queryByText("noPolicyTitle")).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("alert")).getByRole("button"));
    expect(refetch).toHaveBeenCalled();
  });

  it("points a settings manager at the policy header action when none is set", () => {
    mocks.policy = { ...POLICY_OK, data: { levels: [] } };
    mocks.useSPCandidatesQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    render(<AtRiskPanel />);

    expect(screen.getByText("noPolicyTitle")).toBeInTheDocument();
    expect(screen.getByText("noPolicyBody")).toBeInTheDocument();
  });

  it("asks anyone else to get an admin to set the policy", () => {
    mocks.canManage = false;
    mocks.policy = { ...POLICY_OK, data: { levels: [] } };
    mocks.useSPCandidatesQuery.mockReturnValue({ data: { data: [] }, isLoading: false });
    render(<AtRiskPanel />);

    expect(screen.getByText("noPolicyBodyAsk")).toBeInTheDocument();
    expect(screen.queryByText("noPolicyBody")).not.toBeInTheDocument();
  });
});
