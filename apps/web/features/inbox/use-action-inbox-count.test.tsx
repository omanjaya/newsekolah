import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useActionInboxCount, useActionInboxSummary } from "./use-action-inbox-count";

const mocks = vi.hoisted(() => ({
  permissions: new Set<string>(),
  profileKind: "teacher",
  leave: vi.fn(),
  exit: vi.fn(),
  late: vi.fn(),
  policy: vi.fn(),
  candidates: vi.fn(),
}));

vi.mock("../../lib/session/session-provider", () => ({
  useCan: (code: string) => mocks.permissions.has(code),
  useSession: () => ({ me: { profile_kind: mocks.profileKind } }),
}));
vi.mock("../permits/api", () => ({
  useLeaveReviewQueueQuery: mocks.leave,
  useExitPermitReviewQueueQuery: mocks.exit,
  useLateArrivalQueueQuery: mocks.late,
}));
vi.mock("../discipline/api", () => ({
  useDisciplinePolicyQuery: mocks.policy,
  useSPCandidatesQuery: mocks.candidates,
}));

function result(items: unknown[]) {
  return { data: { data: items }, isLoading: false, isError: false };
}

const levels = [
  { level: 1, label: "SP1", min_points: 10 },
  { level: 2, label: "SP2", min_points: 20 },
];

beforeEach(() => {
  mocks.permissions = new Set();
  mocks.profileKind = "student";
  mocks.leave.mockReset().mockReturnValue(result([{}, {}]));
  mocks.exit.mockReset().mockReturnValue(result([{}]));
  mocks.late.mockReset().mockReturnValue(result([{}, {}, {}]));
  mocks.policy.mockReset().mockReturnValue({ data: { levels }, isLoading: false, isError: false });
  mocks.candidates.mockReset().mockReturnValue(
    result([
      { student_user_id: "a", total_points: 12, issued_levels: [] },
      { student_user_id: "b", total_points: 12, issued_levels: [1] },
    ]),
  );
});

describe("useActionInboxCount", () => {
  it("is zero and keeps every query disabled without any permission", () => {
    const { result: hook } = renderHook(() => useActionInboxCount());
    expect(hook.current).toBe(0);
    expect(mocks.leave).toHaveBeenCalledWith(false);
    expect(mocks.exit).toHaveBeenCalledWith(false);
    expect(mocks.late).toHaveBeenCalledWith(false);
    expect(mocks.policy).toHaveBeenCalledWith(false);
    expect(mocks.candidates).toHaveBeenCalledWith(expect.anything(), false);
  });

  it("counts only the queues the reader can act on", () => {
    mocks.permissions = new Set(["review_leave_requests", "scan_exit_permits"]);
    const { result: hook } = renderHook(() => useActionInboxSummary());
    expect(hook.current).toMatchObject({ leave: 2, exit: 1, late: 0, warningLetters: 0, total: 3 });
  });

  it("counts late arrivals for teachers and staff", () => {
    mocks.profileKind = "staff";
    const { result: hook } = renderHook(() => useActionInboxCount());
    expect(hook.current).toBe(3);
  });

  it("counts only warning-letter candidates with a level still due", () => {
    mocks.permissions = new Set(["issue_warning_letters"]);
    const { result: hook } = renderHook(() => useActionInboxSummary());
    expect(hook.current.warningLetters).toBe(1);
    expect(hook.current.total).toBe(1);
  });

  it("reports loading and error from the enabled queries only", () => {
    mocks.permissions = new Set(["review_leave_requests"]);
    mocks.leave.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    mocks.exit.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { result: hook } = renderHook(() => useActionInboxSummary());
    expect(hook.current.isLoading).toBe(true);
    expect(hook.current.isError).toBe(false);
  });
});
