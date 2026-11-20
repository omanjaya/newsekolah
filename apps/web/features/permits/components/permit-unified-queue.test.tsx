import { endExitAnimation, playExitAnimations } from "@newsekolah/ui/test/exit-animation";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PermitUnifiedQueue } from "./permit-unified-queue";

const mocks = vi.hoisted(() => ({
  leave: vi.fn(),
  exit: vi.fn(),
  late: vi.fn(),
  directory: vi.fn(),
  can: vi.fn(),
  reviewMutate: vi.fn(),
  reviewMutateAsync: vi.fn(),
}));
// useUrlState reads the query through the router; follow the address.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("@newsekolah/i18n", () => ({
  formatDateTime: () => "29 Sep 2026, 07:10",
  formatDateRange: (from: string, to: string) => `range ${from}..${to}`,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: mocks.can,
  useSession: () => ({
    me: {
      permissions: ["view_discipline"],
      profile_kind: "teacher",
      tenant: { timezone: "Asia/Makassar" },
    },
  }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/directory-names", () => ({ useDirectoryNames: mocks.directory }));
vi.mock("../api", () => ({
  useLeaveReviewQueueQuery: mocks.leave,
  useExitPermitReviewQueueQuery: mocks.exit,
  useLateArrivalQueueQuery: mocks.late,
  useReviewLeaveRequestMutation: () => ({
    mutate: mocks.reviewMutate,
    mutateAsync: mocks.reviewMutateAsync,
    variables: undefined,
  }),
}));
vi.mock("./exit-permit-panels", () => ({ GatePanel: () => null }));
vi.mock("./approve-panel", () => ({
  ApprovePanel: ({
    kind,
    instanceId,
    onApproved,
  }: {
    kind: string;
    instanceId: string;
    onApproved?: () => void;
  }) => (
    <div data-testid="approve-panel">
      {`${kind}:${instanceId}`}
      <button type="button" onClick={onApproved}>
        student-scanned
      </button>
    </div>
  ),
}));
vi.mock("./late-arrivals-view", () => ({
  LateArrivalReviewForm: () => <div data-testid="late-review-form" />,
}));
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
    school_days: 1,
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
    current_stage: {
      key: "duty_teacher",
      label: "Guru piket",
      approver_rule: "any_teacher",
      verification: "manual" as const,
    },
  };
}

/** A late arrival past its review, waiting for the caller's own approval QR. */
function lateItemAtLeadership(id: string) {
  return {
    ...lateItem(id),
    current_stage_index: 1,
    current_stage: {
      key: "leadership",
      label: "Pimpinan",
      approver_rule: "duty:leadership",
      verification: "qr_scan" as const,
    },
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
  mocks.directory.mockReturnValue(new Map());
});

describe("permit queue data boundaries", () => {
  it("fetches only the late queue for a teacher and hides cached data from other sources", () => {
    mocks.late.mockReturnValue(emptyResult);
    mocks.directory.mockReturnValue(new Map());
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
    expect(mocks.directory).toHaveBeenCalledWith([], true);
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

  it("links the student name to the profile for a reader who can open it", () => {
    mocks.can.mockImplementation((permission: string) => permission === "review_leave_requests");
    mocks.leave.mockReturnValue({ ...emptyResult, data: { data: [leaveItem("a")] } });

    render(<PermitUnifiedQueue />);

    expect(screen.getByRole("link", { name: /Siswa a/ }).getAttribute("href")).toMatch(
      /^\/students\//,
    );
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

  it("shows the days a leave covers on its card, the submission time only as such", () => {
    mocks.can.mockImplementation((permission: string) => permission === "review_leave_requests");
    mocks.leave.mockReturnValue({
      ...emptyResult,
      data: { data: [{ ...leaveItem("a"), starts_on: "2026-11-30", ends_on: "2026-12-01" }] },
    });

    render(<PermitUnifiedQueue />);

    expect(screen.getByText("leave · range 2026-11-30..2026-12-01 · days")).toBeInTheDocument();
    expect(screen.getByText("submittedAt")).toBeInTheDocument();
  });

  it("lists the letter stage for a counselor who only issues letters, with no review buttons", async () => {
    mocks.can.mockImplementation((permission: string) => permission === "issue_leave_letters");
    mocks.leave.mockReturnValue({
      ...emptyResult,
      data: { data: [{ ...leaveItem("a"), current_stage_index: 1, awaiting_letter: true }] },
    });

    render(<PermitUnifiedQueue />);

    expect(mocks.leave).toHaveBeenCalledWith(true);
    expect(screen.getByText("awaitingLetter")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "reject" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "issueLetter" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not offer Setujui on a request waiting for its letter, even to a reviewer", () => {
    mocks.can.mockImplementation(
      (permission: string) =>
        permission === "review_leave_requests" || permission === "issue_leave_letters",
    );
    mocks.leave.mockReturnValue({
      ...emptyResult,
      data: {
        data: [
          { ...leaveItem("a"), awaiting_letter: false },
          { ...leaveItem("b"), current_stage_index: 1, awaiting_letter: true },
        ],
      },
    });

    render(<PermitUnifiedQueue />);

    expect(screen.getAllByRole("button", { name: "approve" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "issueLetter" })).toHaveLength(1);
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

describe("permit queue late arrival actions", () => {
  it("opens the review form for a late arrival waiting at the picket review", async () => {
    mocks.late.mockReturnValue({ ...emptyResult, data: { data: [lateItem("a")] } });
    render(<PermitUnifiedQueue />);
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByTestId("late-review-form")).toBeInTheDocument();
    expect(screen.queryByTestId("approve-panel")).not.toBeInTheDocument();
  });

  it("titles the picket review sheet and names the student and class, as the duty desk does", async () => {
    mocks.directory.mockReturnValue(new Map([["student-a", { id: "student-a", name: "Siswa a" }]]));
    mocks.late.mockReturnValue({
      ...emptyResult,
      data: { data: [{ ...lateItem("a"), class_name: "X-A" }] },
    });
    render(<PermitUnifiedQueue />);
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("reviewTitle");
    expect(dialog).toHaveAccessibleDescription("Siswa a · X-A");
  });

  it("keeps the approval sheet open when a refetch drops its row, and tells the host", async () => {
    const onSheetOpenChange = vi.fn();
    mocks.late.mockReturnValue({ ...emptyResult, data: { data: [lateItemAtLeadership("b")] } });
    const { rerender } = render(<PermitUnifiedQueue onSheetOpenChange={onSheetOpenChange} />);
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    expect(onSheetOpenChange).toHaveBeenLastCalledWith(true);

    // The student's scan passed the stage: the queue no longer lists it.
    mocks.late.mockReturnValue(emptyResult);
    rerender(<PermitUnifiedQueue onSheetOpenChange={onSheetOpenChange} />);
    expect(screen.getByTestId("approve-panel")).toHaveTextContent("late_arrival:b");

    await userEvent.click(screen.getByRole("button", { name: "student-scanned" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onSheetOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("keeps naming the student once a refetch drops the approved row from the lookup", async () => {
    // The directory resolves only the ids it is asked for, as the real
    // per-id lookup does: an id that leaves the list leaves the map.
    mocks.directory.mockImplementation(
      (ids: string[]) =>
        new Map(
          ids
            .filter((id) => id === "student-b")
            .map((id) => [id, { id, name: "Siswa Dua Contoh" }]),
        ),
    );
    mocks.late.mockReturnValue({
      ...emptyResult,
      data: { data: [{ ...lateItemAtLeadership("b"), class_name: "X-A" }] },
    });
    const { rerender } = render(<PermitUnifiedQueue />);
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription("Siswa Dua Contoh · X-A");

    mocks.late.mockReturnValue(emptyResult);
    rerender(<PermitUnifiedQueue />);
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription("Siswa Dua Contoh · X-A");
  });

  it("moves focus to the next row's Tindak lanjuti when the sheet closes itself", async () => {
    mocks.late.mockReturnValue({
      ...emptyResult,
      data: { data: [lateItemAtLeadership("b"), lateItemAtLeadership("c")] },
    });
    const { rerender } = render(<PermitUnifiedQueue />);
    const [first] = screen.getAllByRole("button", { name: "open" });
    if (!first) throw new Error("no row");
    await userEvent.click(first);

    // The scan passed the stage: the refetch drops the row and its button.
    mocks.late.mockReturnValue({ ...emptyResult, data: { data: [lateItemAtLeadership("c")] } });
    rerender(<PermitUnifiedQueue />);
    await userEvent.click(screen.getByRole("button", { name: "student-scanned" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    const next = screen.getByRole("button", { name: "open" });
    await waitFor(() => {
      expect(next).toHaveFocus();
    });
    // Nothing still hides it from assistive technology.
    expect(next.closest("[aria-hidden='true']")).toBeNull();
  });

  it("moves focus to the row that took a middle row's place, not to the top", async () => {
    mocks.late.mockReturnValue({
      ...emptyResult,
      data: {
        data: [lateItemAtLeadership("a"), lateItemAtLeadership("b"), lateItemAtLeadership("c")],
      },
    });
    const { rerender } = render(<PermitUnifiedQueue />);
    const second = screen.getAllByRole("button", { name: "open" })[1];
    if (!second) throw new Error("no second row");
    await userEvent.click(second);
    expect(screen.getByTestId("approve-panel")).toHaveTextContent("late_arrival:b");

    mocks.late.mockReturnValue({
      ...emptyResult,
      data: { data: [lateItemAtLeadership("a"), lateItemAtLeadership("c")] },
    });
    rerender(<PermitUnifiedQueue />);
    await userEvent.click(screen.getByRole("button", { name: "student-scanned" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    // The old third row now sits second.
    const next = screen.getAllByRole("button", { name: "open" })[1];
    await waitFor(() => {
      expect(next).toHaveFocus();
    });
  });

  it("hands focus to the host's fallback when the last row left with the sheet", async () => {
    mocks.late.mockReturnValue({ ...emptyResult, data: { data: [lateItemAtLeadership("b")] } });
    const heading = document.createElement("h2");
    heading.textContent = "permits";
    document.body.append(heading);
    const fallback = () => heading;
    const { rerender } = render(<PermitUnifiedQueue returnFocusFallback={fallback} />);
    await userEvent.click(screen.getByRole("button", { name: "open" }));

    mocks.late.mockReturnValue(emptyResult);
    rerender(<PermitUnifiedQueue returnFocusFallback={fallback} />);
    await userEvent.click(screen.getByRole("button", { name: "student-scanned" }));

    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
    expect(heading).toHaveAttribute("tabindex", "-1");
    heading.remove();
  });

  // Closing cleared the row at once, so the sheet sliding out blanked to
  // the fallback title with no body (audit r6-n14), and the host heard of
  // the close before the slide, so the inbox's all-clear unmounted the
  // sheet mid-animation (audit r6-n15).
  it("keeps its row while it animates closed and reports the close once it is gone", async () => {
    const restore = playExitAnimations();
    try {
      mocks.directory.mockReturnValue(
        new Map([["student-a", { id: "student-a", name: "Siswa a" }]]),
      );
      mocks.late.mockReturnValue({
        ...emptyResult,
        data: { data: [{ ...lateItem("a"), class_name: "X-A" }] },
      });
      const onSheetOpenChange = vi.fn();
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      render(<PermitUnifiedQueue onSheetOpenChange={onSheetOpenChange} />);
      await user.click(screen.getByRole("button", { name: "open" }));
      const dialog = await screen.findByRole("dialog");
      await user.keyboard("{Escape}");

      expect(dialog).toHaveAttribute("data-state", "closed");
      expect(dialog).toHaveAccessibleName("reviewTitle");
      expect(dialog).toHaveAccessibleDescription("Siswa a · X-A");
      expect(within(dialog).getByTestId("late-review-form")).toBeInTheDocument();
      expect(onSheetOpenChange).toHaveBeenLastCalledWith(true);

      endExitAnimation(dialog);
      await waitFor(() => {
        expect(onSheetOpenChange).toHaveBeenLastCalledWith(false);
      });
      expect(dialog).not.toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it("lets a host swap the queue out after the last approval, with focus on what replaced it", async () => {
    function Host({ cleared }: { cleared: boolean }): ReactElement {
      const [sheetOpen, setSheetOpen] = useState(false);
      return cleared && !sheetOpen ? (
        <p id="all-clear">all-clear</p>
      ) : (
        <PermitUnifiedQueue
          onSheetOpenChange={setSheetOpen}
          returnFocusFallback={() => document.getElementById("all-clear")}
        />
      );
    }
    const restore = playExitAnimations();
    try {
      mocks.late.mockReturnValue({ ...emptyResult, data: { data: [lateItemAtLeadership("b")] } });
      const user = userEvent.setup({ pointerEventsCheck: 0 });
      const { rerender } = render(<Host cleared={false} />);
      await user.click(screen.getByRole("button", { name: "open" }));
      const dialog = await screen.findByRole("dialog");

      // The scan went through: nothing waits any more.
      mocks.late.mockReturnValue(emptyResult);
      rerender(<Host cleared />);
      await user.click(within(dialog).getByRole("button", { name: "student-scanned" }));

      // Still sliding out, still saying what it said.
      expect(dialog).toHaveAttribute("data-state", "closed");
      expect(within(dialog).getByTestId("approve-panel")).toBeInTheDocument();
      expect(screen.queryByText("all-clear")).not.toBeInTheDocument();

      endExitAnimation(dialog);
      await waitFor(() => {
        expect(screen.getByText("all-clear")).toHaveFocus();
      });
    } finally {
      restore();
    }
  });

  it("opens the approver's stage QR for a late arrival waiting at a QR stage", async () => {
    mocks.late.mockReturnValue({ ...emptyResult, data: { data: [lateItemAtLeadership("b")] } });
    render(<PermitUnifiedQueue />);
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByTestId("approve-panel")).toHaveTextContent("late_arrival:b");
    expect(screen.queryByTestId("late-review-form")).not.toBeInTheDocument();
  });

  it("titles the approval sheet with the stage and names the student and class before the QR", async () => {
    mocks.directory.mockReturnValue(new Map([["student-b", { id: "student-b", name: "Siswa b" }]]));
    mocks.late.mockReturnValue({
      ...emptyResult,
      data: { data: [{ ...lateItemAtLeadership("b"), class_name: "X-A" }] },
    });
    render(<PermitUnifiedQueue />);
    // The late card names the class, as exit and leave cards do.
    expect(screen.getByText("(X-A)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("titleStage");
    expect(dialog).toHaveAccessibleDescription("Siswa b · X-A");
  });

  it("closes the approval sheet once the student's scan approved the stage", async () => {
    mocks.late.mockReturnValue({ ...emptyResult, data: { data: [lateItemAtLeadership("b")] } });
    render(<PermitUnifiedQueue />);
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    await userEvent.click(screen.getByRole("button", { name: "student-scanned" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the exit permit's own stage QR for an approver, with no code to type", async () => {
    mocks.can.mockImplementation((permission: string) => permission === "issue_scan_tokens");
    mocks.exit.mockReturnValue({
      ...emptyResult,
      data: {
        data: [
          {
            instance_id: "e",
            student_user_id: "student-e",
            student_name: "Siswa e",
            class_name: "10 A",
            status: "in_progress",
            current_stage_index: 1,
            current_stage: {
              key: "counselor",
              label: "Guru BK",
              approver_rule: "duty:counselor",
              verification: "qr_scan",
            },
            destination: "Puskesmas",
            opened_at: "2026-09-29T00:10:00Z",
          },
        ],
      },
    });
    render(<PermitUnifiedQueue />);
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByTestId("approve-panel")).toHaveTextContent("exit_permit:e");
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("titleStage");
    expect(dialog).toHaveAccessibleDescription("Siswa e · 10 A");
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

  it("narrows the queue by type with the segmented filter and keeps it in the URL", async () => {
    render(<PermitUnifiedQueue />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);

    await userEvent.click(screen.getByRole("radio", { name: /^late/ }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /^late/ })).toHaveAttribute("aria-checked", "true");
    expect(window.location.search).toBe("?type=late");
  });

  it("carries each queue's count on its filter segment instead of a row of tiles", () => {
    render(<PermitUnifiedQueue />);
    expect(screen.getByRole("radio", { name: "leave 2" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "late 1" })).toBeInTheDocument();
    expect(screen.queryByTestId("permit-queue-tiles")).not.toBeInTheDocument();
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

  it("approves the selected leave requests in bulk", async () => {
    mocks.reviewMutateAsync.mockResolvedValue(undefined);
    render(<PermitUnifiedQueue />);
    const boxes = screen.getAllByRole("checkbox");
    // Two leave cards are selectable; the late card is not.
    expect(boxes).toHaveLength(2);
    for (const box of boxes) await userEvent.click(box);
    await userEvent.click(screen.getByRole("button", { name: "bulkApprove" }));
    expect(mocks.reviewMutateAsync).toHaveBeenCalledTimes(2);
    expect(mocks.reviewMutateAsync).toHaveBeenCalledWith({ id: "a", approve: true });
  });

  it("drops ticked requests a filter hides from approve selected", async () => {
    render(<PermitUnifiedQueue />);
    for (const box of screen.getAllByRole("checkbox")) await userEvent.click(box);
    expect(screen.getByRole("button", { name: "bulkApprove" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /^late/ }));
    expect(screen.queryByRole("button", { name: "bulkApprove" })).not.toBeInTheDocument();
    expect(mocks.reviewMutateAsync).not.toHaveBeenCalled();
  });

  it("offers no selection for a single leave request", () => {
    mocks.leave.mockReturnValue({ ...emptyResult, data: { data: [leaveItem("a")] } });
    render(<PermitUnifiedQueue />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows no type filter when the reader has a single queue", () => {
    mocks.can.mockReturnValue(false);
    render(<PermitUnifiedQueue />);
    expect(screen.queryByRole("radiogroup", { name: "typeFilter" })).not.toBeInTheDocument();
  });
});
