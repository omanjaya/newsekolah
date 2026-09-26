import { render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const leaveReviewQueueQuery = vi.hoisted(() => vi.fn());
const spCandidatesQuery = vi.hoisted(() => vi.fn());

vi.mock("../../../permits/api", () => ({
  useLeaveReviewQueueQuery: leaveReviewQueueQuery,
}));

vi.mock("../../../discipline/api", () => ({
  useSPCandidatesQuery: spCandidatesQuery,
}));

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
    expect(result.current.hero?.action?.href).toBe("/leave-requests");
    expect(result.current.tiles.find((t) => t.key === "counselor.leave")?.value).toBe("2");
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
    render(<>{result.current.left.map((slot) => slot.node)}</>);

    expect(screen.queryByText("counselor.leaveSectionTitle")).not.toBeInTheDocument();
    expect(screen.getByText("counselor.spSectionTitle")).toBeInTheDocument();
    expect(result.current.tiles.find((t) => t.key === "counselor.leave")).toBeUndefined();
  });

  it("does not render the SP section, only the leave section, without issue_warning_letters", () => {
    const meWithoutIssue = { permissions: ["review_leave_requests"] } as unknown as Me;
    leaveReviewQueueQuery.mockReturnValue(refetchable({ data: { data: [] } }));
    spCandidatesQuery.mockReturnValue(refetchable({}));

    const { result } = renderHook(() => useCounselorBlock(meWithoutIssue, true));
    render(<>{result.current.left.map((slot) => slot.node)}</>);

    expect(screen.getByText("counselor.leaveSectionTitle")).toBeInTheDocument();
    expect(screen.queryByText("counselor.spSectionTitle")).not.toBeInTheDocument();
    expect(result.current.tiles.find((t) => t.key === "counselor.sp")).toBeUndefined();
  });

  it("returns no left slot when neither permission is held", () => {
    const meWithNeither = { permissions: [] } as unknown as Me;
    leaveReviewQueueQuery.mockReturnValue(refetchable({}));
    spCandidatesQuery.mockReturnValue(refetchable({}));

    const { result } = renderHook(() => useCounselorBlock(meWithNeither, true));

    expect(result.current.left).toEqual([]);
    expect(result.current.tiles).toEqual([]);
  });

  it("shows a retry action and no tiles when the leave queue fails", () => {
    const refetch = vi.fn();
    leaveReviewQueueQuery.mockReturnValue(refetchable({ isError: true, refetch }));
    spCandidatesQuery.mockReturnValue(refetchable({ data: { data: [] } }));

    const { result } = renderHook(() => useCounselorBlock(counselorWithBothPermissions, true));

    expect(result.current.tiles.find((t) => t.key === "counselor.leave")).toBeUndefined();
    render(<>{result.current.left.map((slot) => slot.node)}</>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
