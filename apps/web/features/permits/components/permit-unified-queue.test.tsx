import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PermitUnifiedQueue } from "./permit-unified-queue";

const mocks = vi.hoisted(() => ({
  leave: vi.fn(),
  exit: vi.fn(),
  late: vi.fn(),
  directory: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => false,
  useSession: () => ({ me: { profile_kind: "teacher", tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../../reference/api", () => ({
  useDirectoryQuery: mocks.directory,
  useLookup: () => new Map(),
}));
vi.mock("../api", () => ({
  useLeaveReviewQueueQuery: mocks.leave,
  useExitPermitReviewQueueQuery: mocks.exit,
  useLateArrivalQueueQuery: mocks.late,
}));
vi.mock("./exit-permit-panels", () => ({ ApprovePanel: () => null, GatePanel: () => null }));
vi.mock("./late-arrivals-view", () => ({ LateArrivalReviewForm: () => null }));
vi.mock("./leave-request-detail", () => ({ LeaveRequestDetail: () => null }));

describe("permit queue data boundaries", () => {
  it("fetches only the late queue for a teacher and hides cached data from other sources", () => {
    const result = { data: { data: [] }, isLoading: false, isError: false };
    mocks.late.mockReturnValue(result);
    mocks.directory.mockReturnValue(result);
    const staleResult = {
      ...result,
      data: {
        data: [
          {
            instance_id: "cached",
            student_user_id: "someone-else",
            student_name: "Private Student",
            opened_at: "2026-09-29T00:00:00Z",
            status: "in_progress",
          },
        ],
      },
    };
    mocks.leave.mockReturnValue(staleResult);
    mocks.exit.mockReturnValue(staleResult);
    render(<PermitUnifiedQueue />);
    expect(mocks.late).toHaveBeenCalledWith(true);
    expect(mocks.leave).toHaveBeenCalledWith(false);
    expect(mocks.exit).toHaveBeenCalledWith(false);
    expect(mocks.directory).toHaveBeenCalledWith("student", true);
    expect(screen.queryByText("Private Student")).not.toBeInTheDocument();
    expect(screen.getByText("queueEmpty")).toBeInTheDocument();
  });
});
