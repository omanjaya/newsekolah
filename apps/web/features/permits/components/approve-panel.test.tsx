import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "approve-token-of-forty-three-characters-xxxx";

const leadershipStage = {
  key: "leadership",
  label: "Pimpinan",
  approver_rule: "duty:leadership",
  verification: "qr_scan",
};
const classTeacherStage = {
  key: "class_teacher",
  label: "Guru kelas",
  approver_rule: "teacher_of_class_now",
  verification: "qr_scan",
};
const counselorStage = {
  key: "counselor",
  label: "Guru BK",
  approver_rule: "duty:counselor",
  verification: "qr_scan",
};

function lateInstance(overrides: Record<string, unknown> = {}) {
  return {
    id: "late-1",
    status: "in_progress",
    current_stage_index: 1,
    subject_user_id: "student-l",
    current_stage: leadershipStage,
    ...overrides,
  };
}

interface QueryCall {
  id: string;
  pollMs: unknown;
}

const mocks = vi.hoisted(
  (): {
    mint: ReturnType<typeof vi.fn>;
    invalidate: ReturnType<typeof vi.fn>;
    exitCalls: QueryCall[];
    lateCalls: QueryCall[];
    lateInstance: Record<string, unknown>;
    lateClassName: string | undefined;
    exitStatus: string;
    exitFresh: boolean;
    lessons: { over: boolean; known: boolean };
  } => ({
    mint: vi.fn(),
    invalidate: vi.fn(),
    exitCalls: [],
    lateCalls: [],
    lateInstance: {},
    lateClassName: "X-A",
    exitStatus: "in_progress",
    exitFresh: true,
    lessons: { over: false, known: true },
  }),
);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? [key, ...Object.values(values)].join(":") : key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/directory-names", () => ({
  useDirectoryNames: (ids: string[]) =>
    new Map(ids.map((id) => [id, { id, name: "Siswa Terlambat", username: "s" }])),
}));
vi.mock("../lib/use-school-time", () => ({
  usePermitLessons: (permit: unknown) =>
    permit === undefined ? { over: false, known: false } : mocks.lessons,
}));
vi.mock("./workflow-stepper", () => ({ WorkflowSteps: () => <div data-testid="steps" /> }));

vi.mock("../api", () => ({
  encodeScanPayload: (kind: string, id: string, token: string) => `sion:${kind}:${id}:${token}`,
  useInvalidatePermits: () => mocks.invalidate,
  useIssueScanTokenMutation: () => ({
    mutate: mocks.mint,
    data: {
      token: TOKEN,
      purpose: "approve_stage",
      context_id: "x",
      expires_at: new Date(Date.now() + 30_000).toISOString(),
    },
    isError: false,
    isPending: false,
  }),
  useExitPermitQuery: (id: string, options: { pollMs?: unknown } = {}) => {
    mocks.exitCalls.push({ id, pollMs: options.pollMs });
    return {
      data:
        id === ""
          ? undefined
          : {
              instance: {
                id,
                status: mocks.exitStatus,
                current_stage_index: 1,
                subject_user_id: "student-e",
                current_stage: counselorStage,
              },
              student_name: "Siswa Izin",
              class_name: "10 A",
              destination: "Puskesmas",
            },
      isFetchedAfterMount: id !== "" && mocks.exitFresh,
      error: null,
      refetch: vi.fn(),
    };
  },
  useLateArrivalQuery: (id: string, options: { pollMs?: unknown } = {}) => {
    mocks.lateCalls.push({ id, pollMs: options.pollMs });
    return {
      data:
        id === ""
          ? undefined
          : {
              instance: { ...mocks.lateInstance, id },
              reason: "Macet",
              class_name: mocks.lateClassName,
            },
      isFetchedAfterMount: id !== "",
      error: null,
      refetch: vi.fn(),
    };
  },
}));

import { APPROVAL_POLL_MS, APPROVED_CLOSE_MS, ApprovePanel } from "./approve-panel";

beforeEach(() => {
  mocks.mint.mockClear();
  mocks.invalidate.mockClear();
  mocks.exitCalls = [];
  mocks.lateCalls = [];
  mocks.lateInstance = lateInstance();
  mocks.lateClassName = "X-A";
  mocks.exitStatus = "in_progress";
  mocks.exitFresh = true;
  mocks.lessons = { over: false, known: true };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ApprovePanel", () => {
  it("mints a stage QR bound to the late arrival, names the student and class, prints no code", () => {
    render(<ApprovePanel kind="late_arrival" instanceId="late-1" />);

    expect(mocks.mint).toHaveBeenCalledWith(
      { purpose: "approve_stage", context_id: "late-1" },
      expect.anything(),
    );
    expect(screen.getByRole("img", { name: "qrLabelStage:Pimpinan" })).toBeInTheDocument();
    expect(screen.getByText("hintStage:Pimpinan")).toBeInTheDocument();
    expect(screen.getByText("Siswa Terlambat")).toBeInTheDocument();
    expect(screen.getByText("class")).toBeInTheDocument();
    expect(screen.getByText("X-A")).toBeInTheDocument();
    expect(screen.getByText("Macet")).toBeInTheDocument();
    expect(screen.queryByText(TOKEN)).not.toBeInTheDocument();
    // Only the late arrival's own detail is read.
    expect(mocks.exitCalls.every((call) => call.id === "")).toBe(true);
  });

  it("leaves the class out when the late arrival does not name one", () => {
    mocks.lateClassName = undefined;
    render(<ApprovePanel kind="late_arrival" instanceId="late-1" />);
    expect(screen.queryByText("class")).not.toBeInTheDocument();
  });

  it("reads an exit permit's own detail for its stage QR", () => {
    render(<ApprovePanel kind="exit_permit" instanceId="exit-1" />);

    expect(mocks.mint).toHaveBeenCalledWith(
      { purpose: "approve_stage", context_id: "exit-1" },
      expect.anything(),
    );
    expect(screen.getByRole("img", { name: "qrLabelStage:Guru BK" })).toBeInTheDocument();
    expect(screen.getByText("Siswa Izin")).toBeInTheDocument();
    expect(screen.getByText("Puskesmas")).toBeInTheDocument();
    expect(screen.queryByText(TOKEN)).not.toBeInTheDocument();
    expect(mocks.lateCalls.every((call) => call.id === "")).toBe(true);
  });

  it("mints no QR until a fresh read finds the stage waiting", () => {
    // Only a cached copy from an earlier visit so far.
    mocks.exitFresh = false;
    const { rerender } = render(<ApprovePanel kind="exit_permit" instanceId="exit-1" />);
    expect(mocks.mint).not.toHaveBeenCalled();

    mocks.exitFresh = true;
    rerender(<ApprovePanel kind="exit_permit" instanceId="exit-1" />);
    expect(mocks.mint).toHaveBeenCalledTimes(1);
    rerender(<ApprovePanel kind="exit_permit" instanceId="exit-1" />);
    expect(mocks.mint).toHaveBeenCalledTimes(1);
  });

  // The regression: the counsellor's sheet for an exit permit from an
  // earlier day said the flow was closed, yet still minted a stage token.
  it("mints no QR for a flow the first read finds closed", () => {
    mocks.exitStatus = "expired";
    render(<ApprovePanel kind="exit_permit" instanceId="exit-1" />);
    expect(mocks.mint).not.toHaveBeenCalled();
    expect(screen.queryByRole("img", { name: /qrLabelStage/ })).not.toBeInTheDocument();
    expect(screen.getByText("closedFor:Siswa Izin")).toBeInTheDocument();
  });

  // The regression: on the permit's own day, once its lessons were over,
  // the student's card read it as expired while the approver's sheet still
  // showed a waiting QR the student's scan could only be refused with.
  it("mints no QR for an exit permit opened after its lessons ended", () => {
    mocks.lessons = { over: true, known: true };
    render(<ApprovePanel kind="exit_permit" instanceId="exit-1" />);
    expect(mocks.mint).not.toHaveBeenCalled();
    expect(screen.queryByRole("img", { name: /qrLabelStage/ })).not.toBeInTheDocument();
    expect(screen.getByText("closedFor:Siswa Izin")).toBeInTheDocument();
  });

  it("mints no QR for an exit permit until the periods say whether its lessons are over", () => {
    mocks.lessons = { over: false, known: false };
    const { rerender } = render(<ApprovePanel kind="exit_permit" instanceId="exit-1" />);
    expect(mocks.mint).not.toHaveBeenCalled();

    mocks.lessons = { over: false, known: true };
    rerender(<ApprovePanel kind="exit_permit" instanceId="exit-1" />);
    expect(mocks.mint).toHaveBeenCalledTimes(1);
  });

  it("drops the exit permit's QR when its lessons end while the sheet is open", () => {
    const { rerender } = render(<ApprovePanel kind="exit_permit" instanceId="exit-1" />);
    expect(screen.getByRole("img", { name: "qrLabelStage:Guru BK" })).toBeInTheDocument();

    mocks.lessons = { over: true, known: true };
    rerender(<ApprovePanel kind="exit_permit" instanceId="exit-1" />);
    expect(screen.queryByRole("img", { name: /qrLabelStage/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/approvedFor/)).not.toBeInTheDocument();
    expect(screen.getByText("closedFor:Siswa Izin")).toBeInTheDocument();
  });

  it("polls the flow while the QR waits for the student", () => {
    render(<ApprovePanel kind="late_arrival" instanceId="late-1" />);
    expect(mocks.lateCalls.at(-1)).toEqual({ id: "late-1", pollMs: APPROVAL_POLL_MS });
  });

  it("answers the student's scan: the QR gives way to the approval, then the sheet hands back", () => {
    vi.useFakeTimers();
    const onApproved = vi.fn();
    const { rerender } = render(
      <ApprovePanel kind="late_arrival" instanceId="late-1" onApproved={onApproved} />,
    );
    expect(screen.getByRole("img", { name: "qrLabelStage:Pimpinan" })).toBeInTheDocument();

    // The student scanned: the next poll finds the flow at the class teacher.
    mocks.lateInstance = lateInstance({ current_stage_index: 2, current_stage: classTeacherStage });
    rerender(<ApprovePanel kind="late_arrival" instanceId="late-1" onApproved={onApproved} />);

    expect(screen.getByText("approvedFor:Siswa Terlambat:Pimpinan")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /qrLabelStage/ })).not.toBeInTheDocument();
    expect(mocks.invalidate).toHaveBeenCalled();
    // Polling stops once the stage is approved.
    expect(mocks.lateCalls.at(-1)).toEqual({ id: "late-1", pollMs: false });

    expect(onApproved).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(APPROVED_CLOSE_MS);
    });
    expect(onApproved).toHaveBeenCalledTimes(1);
  });

  it("reads the last stage's completion as approved", () => {
    const { rerender } = render(<ApprovePanel kind="late_arrival" instanceId="late-1" />);
    mocks.lateInstance = lateInstance({ status: "completed", current_stage: undefined });
    rerender(<ApprovePanel kind="late_arrival" instanceId="late-1" />);
    expect(screen.getByText("approvedFor:Siswa Terlambat:Pimpinan")).toBeInTheDocument();
  });

  it("drops the QR without claiming approval when the flow closed another way", () => {
    const { rerender } = render(<ApprovePanel kind="late_arrival" instanceId="late-1" />);
    mocks.lateInstance = lateInstance({ status: "expired" });
    rerender(<ApprovePanel kind="late_arrival" instanceId="late-1" />);
    expect(screen.queryByRole("img", { name: /qrLabelStage/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/approvedFor/)).not.toBeInTheDocument();
    // The approver is told why the QR went away, not left with a blank sheet.
    expect(screen.getByText(/closedFor/)).toBeInTheDocument();
  });
});
