import { render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const leaveReviewQueueQuery = vi.hoisted(() => vi.fn());
const spCandidatesQuery = vi.hoisted(() => vi.fn());
const atRiskQuery = vi.hoisted(() => vi.fn());

vi.mock("../../../permits/api", () => ({
  useLeaveReviewQueueQuery: leaveReviewQueueQuery,
}));

vi.mock("../../../discipline/api", () => ({
  useSPCandidatesQuery: spCandidatesQuery,
}));

vi.mock("../../../analytics/api", () => ({ useAtRiskStudentsQuery: atRiskQuery }));

vi.mock("../../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [{ id: "c1", name: "X-A" }] } }),
  useLookup: (items: { id: string }[] | undefined) =>
    new Map((items ?? []).map((item) => [item.id, item])),
}));
vi.mock("../../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../../test/directory-names-stub");
  return directoryNamesStub([{ id: "s1", name: "Siswa A" }]);
});

vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${JSON.stringify(values)}` : key,
      { has: () => true },
    ),
}));

import { EMPTY_BLOCK } from "../types";
import type { Me } from "../types";

import { useCounselorBlock } from "./counselor";

function refetchable(overrides: Record<string, unknown>) {
  return { isLoading: false, isError: false, data: undefined, refetch: vi.fn(), ...overrides };
}

const counselorWithBothPermissions = {
  permissions: ["review_leave_requests", "issue_warning_letters"],
} as unknown as Me;

describe("useCounselorBlock", () => {
  beforeEach(() => {
    leaveReviewQueueQuery.mockReset();
    spCandidatesQuery.mockReset();
    atRiskQuery.mockReset();
    atRiskQuery.mockReturnValue(refetchable({ data: { data: [] } }));
  });

  it("returns EMPTY_BLOCK and disables both queries when inactive", () => {
    leaveReviewQueueQuery.mockReturnValue(refetchable({}));
    spCandidatesQuery.mockReturnValue(refetchable({}));

    const { result } = renderHook(() => useCounselorBlock(counselorWithBothPermissions, false));

    expect(result.current).toBe(EMPTY_BLOCK);
    expect(leaveReviewQueueQuery).toHaveBeenCalledWith(false);
    expect(spCandidatesQuery).toHaveBeenCalledWith(expect.anything(), false);
  });

  it("does not query the leave review queue without review_leave_requests, even when the counselor duty is active", () => {
    const meWithoutReview = { permissions: ["issue_warning_letters"] } as unknown as Me;
    leaveReviewQueueQuery.mockReturnValue(refetchable({}));
    spCandidatesQuery.mockReturnValue(refetchable({ data: { data: [] } }));

    renderHook(() => useCounselorBlock(meWithoutReview, true));

    expect(leaveReviewQueueQuery).toHaveBeenCalledWith(false);
    expect(spCandidatesQuery).toHaveBeenCalledWith(expect.anything(), true);
  });

  it("does not query SP candidates without issue_warning_letters", () => {
    const meWithoutIssue = { permissions: ["review_leave_requests"] } as unknown as Me;
    leaveReviewQueueQuery.mockReturnValue(refetchable({ data: { data: [] } }));
    spCandidatesQuery.mockReturnValue(refetchable({}));

    renderHook(() => useCounselorBlock(meWithoutIssue, true));

    expect(leaveReviewQueueQuery).toHaveBeenCalledWith(true);
    expect(spCandidatesQuery).toHaveBeenCalledWith(expect.anything(), false);
  });

  it("raises a hero with the pending count when the leave queue has 2 pending", () => {
    leaveReviewQueueQuery.mockReturnValue(
      refetchable({
        data: {
          data: [
            {
              instance_id: "a",
              student_name: "Siswa A",
              class_name: "X-A",
              category: "sick",
            },
            {
              instance_id: "b",
              student_name: "Siswa B",
              class_name: "X-B",
              category: "family",
            },
          ],
        },
      }),
    );
    spCandidatesQuery.mockReturnValue(refetchable({ data: { data: [] } }));

    const { result } = renderHook(() => useCounselorBlock(counselorWithBothPermissions, true));

    expect(result.current.hero?.title).toContain('"count":2');
    expect(result.current.hero?.action?.href).toBe("/inbox?type=leave");
    expect(result.current.tiles.find((t) => t.key === "counselor.leave")?.value).toBe("2");
  });

  it("counts the requests waiting for the letter for a counselor who only issues letters", () => {
    const issuerOnly = { permissions: ["issue_leave_letters"] } as unknown as Me;
    leaveReviewQueueQuery.mockReturnValue(
      refetchable({
        data: {
          data: [
            { instance_id: "a", student_name: "Siswa A", class_name: "X-A", awaiting_letter: true },
          ],
        },
      }),
    );
    spCandidatesQuery.mockReturnValue(refetchable({}));

    const { result } = renderHook(() => useCounselorBlock(issuerOnly, true));

    expect(leaveReviewQueueQuery).toHaveBeenCalledWith(true);
    expect(result.current.hero?.key).toBe("counselor.leave");
    expect(result.current.hero?.title).toContain('"count":1');
    expect(result.current.tiles.find((t) => t.key === "counselor.leave")?.value).toBe("1");
  });

  it("links each leave row to its request and offers the letter where it waits", () => {
    const issuerOnly = { permissions: ["issue_leave_letters"] } as unknown as Me;
    leaveReviewQueueQuery.mockReturnValue(
      refetchable({
        data: {
          data: [
            { instance_id: "a", student_name: "Siswa A", class_name: "X-A", awaiting_letter: true },
            {
              instance_id: "b",
              student_name: "Siswa B",
              class_name: "X-B",
              awaiting_letter: false,
            },
          ],
        },
      }),
    );
    spCandidatesQuery.mockReturnValue(refetchable({}));

    const { result } = renderHook(() => useCounselorBlock(issuerOnly, true));
    render(<>{result.current.main.map((slot) => slot.node)}</>);

    const letterRow = screen.getByRole("link", { name: /Siswa A/ });
    expect(letterRow).toHaveAttribute("href", "/leave-requests/a");
    expect(letterRow.closest("li")).toHaveTextContent("counselor.issueLetter");
    const reviewRow = screen.getByRole("link", { name: /Siswa B/ });
    expect(reviewRow).toHaveAttribute("href", "/leave-requests/b");
    expect(reviewRow.closest("li")).toHaveTextContent("counselor.review");
  });

  it("does not render the leave section, only the SP section, without review_leave_requests", () => {
    const meWithoutReview = { permissions: ["issue_warning_letters"] } as unknown as Me;
    leaveReviewQueueQuery.mockReturnValue(refetchable({}));
    spCandidatesQuery.mockReturnValue(
      refetchable({
        data: {
          data: [
            { student_user_id: "s1", student_name: "Siswa A", class_name: "X-A", total_points: 10 },
          ],
        },
      }),
    );

    const { result } = renderHook(() => useCounselorBlock(meWithoutReview, true));
    render(<>{result.current.main.map((slot) => slot.node)}</>);

    expect(screen.queryByText("counselor.leaveSectionTitle")).not.toBeInTheDocument();
    expect(screen.getByText("counselor.spSectionTitle")).toBeInTheDocument();
    expect(result.current.tiles.find((t) => t.key === "counselor.leave")).toBeUndefined();
  });

  it("does not render the SP section, only the leave section, without issue_warning_letters", () => {
    const meWithoutIssue = { permissions: ["review_leave_requests"] } as unknown as Me;
    leaveReviewQueueQuery.mockReturnValue(
      refetchable({
        data: { data: [{ instance_id: "a", student_name: "Siswa A", class_name: "X-A" }] },
      }),
    );
    spCandidatesQuery.mockReturnValue(refetchable({}));

    const { result } = renderHook(() => useCounselorBlock(meWithoutIssue, true));
    render(<>{result.current.main.map((slot) => slot.node)}</>);

    expect(screen.getByText("counselor.leaveSectionTitle")).toBeInTheDocument();
    expect(screen.queryByText("counselor.spSectionTitle")).not.toBeInTheDocument();
    expect(result.current.tiles.find((t) => t.key === "counselor.sp")).toBeUndefined();
  });

  it("leaves the queue card out once every queue it lists has loaded empty", () => {
    leaveReviewQueueQuery.mockReturnValue(refetchable({ data: { data: [] } }));
    spCandidatesQuery.mockReturnValue(refetchable({ data: { data: [] } }));

    const { result } = renderHook(() => useCounselorBlock(counselorWithBothPermissions, true));

    expect(result.current.hero?.key).toBe("counselor.idle");
    expect(result.current.main.some((slot) => slot.key === "counselor.queue")).toBe(false);
  });

  it("keeps the queue card while a queue is still loading", () => {
    leaveReviewQueueQuery.mockReturnValue(refetchable({ isLoading: true }));
    spCandidatesQuery.mockReturnValue(refetchable({ data: { data: [] } }));

    const { result } = renderHook(() => useCounselorBlock(counselorWithBothPermissions, true));

    expect(result.current.main.some((slot) => slot.key === "counselor.queue")).toBe(true);
  });

  it("returns no left slot when neither permission is held", () => {
    const meWithNeither = { permissions: [] } as unknown as Me;
    leaveReviewQueueQuery.mockReturnValue(refetchable({}));
    spCandidatesQuery.mockReturnValue(refetchable({}));

    const { result } = renderHook(() => useCounselorBlock(meWithNeither, true));

    expect(result.current.main).toEqual([]);
    expect(result.current.tiles).toEqual([]);
  });

  it("shows a retry action and no tiles when the leave queue fails", () => {
    const refetch = vi.fn();
    leaveReviewQueueQuery.mockReturnValue(refetchable({ isError: true, refetch }));
    spCandidatesQuery.mockReturnValue(refetchable({ data: { data: [] } }));

    const { result } = renderHook(() => useCounselorBlock(counselorWithBothPermissions, true));

    expect(result.current.tiles.find((t) => t.key === "counselor.leave")).toBeUndefined();
    render(<>{result.current.main.map((slot) => slot.node)}</>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("adds an at-risk card and queries only with view_early_warning", () => {
    const meWithEarlyWarning = { permissions: ["view_early_warning"] } as unknown as Me;
    leaveReviewQueueQuery.mockReturnValue(refetchable({}));
    spCandidatesQuery.mockReturnValue(refetchable({}));
    atRiskQuery.mockReturnValue(
      refetchable({
        data: {
          data: [
            { student_user_id: "s1", class_id: "c1", score: 80, level: "high" },
            { student_user_id: "s2", class_id: "c1", score: 90, level: "high" },
            { student_user_id: "s3", class_id: "c1", score: 70, level: "medium" },
            { student_user_id: "s4", class_id: "c1", score: 60, level: "medium" },
            { student_user_id: "s5", class_id: "c1", score: 0, level: "none" },
          ],
        },
      }),
    );

    const { result } = renderHook(() => useCounselorBlock(meWithEarlyWarning, true));

    expect(atRiskQuery).toHaveBeenCalledWith(true);
    expect(result.current.main.map((slot) => slot.key)).toContain("counselor.atRisk");
    expect(result.current.side).toEqual([]);
    render(<>{result.current.main.map((slot) => slot.node)}</>);
    expect(screen.getByText('count:{"count":4}')).toBeInTheDocument();
    expect(screen.getByText("Siswa A")).toBeInTheDocument();
    // Only the top three by score are listed (s2, s1, s3); s2 and s3 are unknown to the directory.
    expect(screen.getAllByText("unknownStudent")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "viewAll" })).toHaveAttribute("href", "/analytics");
  });

  it("shows no at-risk card without view_early_warning", () => {
    leaveReviewQueueQuery.mockReturnValue(refetchable({}));
    spCandidatesQuery.mockReturnValue(refetchable({}));

    const { result } = renderHook(() => useCounselorBlock(counselorWithBothPermissions, true));

    expect(atRiskQuery).toHaveBeenCalledWith(false);
    expect(result.current.main.some((slot) => slot.key === "counselor.atRisk")).toBe(false);
  });
});
