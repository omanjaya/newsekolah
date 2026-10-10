import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PermitUnifiedQueue } from "./permit-unified-queue";

const mocks = vi.hoisted(() => ({
  leave: vi.fn(),
  exit: vi.fn(),
  late: vi.fn(),
  directory: vi.fn(),
  can: vi.fn(),
  reviewMutate: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("@newsekolah/i18n", () => ({
  formatDateTime: () => "29 Sep 2026, 07:10",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: mocks.can,
  useSession: () => ({ me: { profile_kind: "teacher", tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/api", () => ({
  useDirectoryQuery: mocks.directory,
  useLookup: () => new Map(),
}));
vi.mock("../api", () => ({
  useLeaveReviewQueueQuery: mocks.leave,
  useExitPermitReviewQueueQuery: mocks.exit,
  useLateArrivalQueueQuery: mocks.late,
  useReviewLeaveRequestMutation: () => ({ mutate: mocks.reviewMutate, variables: undefined }),
}));
vi.mock("./exit-permit-panels", () => ({ ApprovePanel: () => null, GatePanel: () => null }));
vi.mock("./late-arrivals-view", () => ({ LateArrivalReviewForm: () => null }));
vi.mock("./leave-request-detail", () => ({ LeaveRequestDetail: () => null }));

const emptyResult = { data: { data: [] }, isLoading: false, isError: false, refetch: vi.fn() };

function leaveItem(id: string) {
  return {
    instance_id: id,
    student_user_id: `student-${id}`,
    student_name: `Siswa ${id}`,
    class_name: "10 A",
    status: "in_progress" as const,
    current_stage_index: 0,
    category: "sick" as const,
    starts_on: "2026-09-29",
    ends_on: "2026-09-29",
    opened_at: "2026-09-29T00:10:00Z",
  };
}

function lateItem(id: string) {
  return {
    instance_id: id,
    student_user_id: `student-${id}`,
    status: "in_progress" as const,
    current_stage_index: 0,
    reason: "Terlambat bangun",
    occurrence_number: 1,
    required_action: "none" as const,
    opened_at: "2026-09-29T00:10:00Z",
  };
}

beforeEach(() => {
  mocks.can.mockReset();
  mocks.can.mockReturnValue(false);
  mocks.reviewMutate.mockClear();
  mocks.leave.mockReset();
  mocks.exit.mockReset();
  mocks.late.mockReset();
  mocks.directory.mockReset();
  mocks.leave.mockReturnValue(emptyResult);
  mocks.exit.mockReturnValue(emptyResult);
  mocks.late.mockReturnValue(emptyResult);
  mocks.directory.mockReturnValue(emptyResult);
});

describe("permit queue data boundaries", () => {
  it("fetches only the late queue for a teacher and hides cached data from other sources", () => {
    mocks.late.mockReturnValue(emptyResult);
    mocks.directory.mockReturnValue(emptyResult);
    const staleResult = {
      ...emptyResult,
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

describe("permit queue bento layout", () => {
  it("spans the last card full width for an odd item count", () => {
    mocks.can.mockImplementation((permission: string) => permission === "review_leave_requests");
    mocks.leave.mockReturnValue({
      ...emptyResult,
      data: { data: [leaveItem("a"), leaveItem("b"), leaveItem("c")] },
    });

    render(<PermitUnifiedQueue />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.className).not.toContain("lg:col-span-2");
    expect(rows[1]?.className).not.toContain("lg:col-span-2");
    expect(rows[2]?.className).toContain("lg:col-span-2");
  });

  it("shows Setujui and Tolak on a leave card for a reviewer and calls the review mutation", async () => {
    mocks.can.mockImplementation((permission: string) => permission === "review_leave_requests");
    mocks.leave.mockReturnValue({ ...emptyResult, data: { data: [leaveItem("a")] } });

    render(<PermitUnifiedQueue />);

    expect(screen.getByRole("button", { name: "reject" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "approve" }));
    expect(mocks.reviewMutate).toHaveBeenCalledTimes(1);
    expect(mocks.reviewMutate.mock.calls[0]?.[0]).toEqual({ id: "a", approve: true });
  });

  it("keeps only Tindak lanjuti, opening the detail dialog, for a type with no one-click decision", async () => {
    // A late arrival's only next step is the review form (needs a reason
    // and a homeroom-reported flag), so the card never gets an inline
    // Setujui/Tolak -- canLate is already true from the session mock.
    mocks.late.mockReturnValue({ ...emptyResult, data: { data: [lateItem("a")] } });

    render(<PermitUnifiedQueue />);

    expect(screen.queryByRole("button", { name: "approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("permit queue filters", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/inbox");
    mocks.can.mockImplementation((permission: string) => permission === "review_leave_requests");
    mocks.leave.mockReturnValue({
      ...emptyResult,
      data: { data: [leaveItem("a"), { ...leaveItem("b"), class_name: "10 B" }] },
    });
    mocks.late.mockReturnValue({ ...emptyResult, data: { data: [lateItem("c")] } });
  });

  it("narrows the queue by type with the chips and keeps it in the URL", async () => {
    render(<PermitUnifiedQueue />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);

    await userEvent.click(screen.getByRole("button", { name: "late" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "late" })).toHaveAttribute("aria-pressed", "true");
    expect(window.location.search).toBe("?type=late");
  });

  it("opens on the type selected by the link", () => {
    window.history.replaceState(null, "", "/inbox?type=leave");
    render(<PermitUnifiedQueue />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("narrows the queue by class", async () => {
    // Radix Select reads pointer-capture and scroll APIs jsdom does not implement.
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.releasePointerCapture = () => undefined;
    Element.prototype.scrollIntoView = () => undefined;
    render(<PermitUnifiedQueue />);
    await userEvent.click(screen.getByRole("combobox", { name: "classFilter" }));
    await userEvent.click(await screen.findByRole("option", { name: "10 B" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("shows no type chips when the reader has a single queue", () => {
    mocks.can.mockReturnValue(false);
    render(<PermitUnifiedQueue />);
    expect(screen.queryByRole("group", { name: "typeFilter" })).not.toBeInTheDocument();
  });
});
