import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ClockModule from "../../../lib/simulation/clock";
import type { ExitPermitDetail } from "../api";

const PERMIT_ID = "0b5e8f5a-6a3c-4b1f-9a62-2f3c1d7e9a10";
const GATE_TOKEN = "gate-token-of-forty-three-characters-xxxxxxx";

const mocks = vi.hoisted(() => ({
  detail: undefined as ExitPermitDetail | undefined,
  cancel: vi.fn(),
  scrollIntoView: vi.fn(),
  reducedMotion: false,
  gate: undefined as { token: string; expires_at: string } | undefined,
  scanDialog: vi.fn(),
  now: new Date("2026-09-29T03:30:00Z"),
  periods: [] as {
    id: string;
    name: string;
    starts_at: string;
    ends_at: string;
    is_break: boolean;
  }[],
}));

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.stage ? `${key}:${values.stage}` : key,
}));
vi.mock("@newsekolah/i18n", () => ({
  formatTime: () => "07:10",
  formatDateTime: () => "29 Sep 2026, 07:10",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/api", () => ({
  usePeriodsQuery: () => ({ data: { data: mocks.periods }, isSuccess: true }),
}));
vi.mock("../../../lib/simulation/clock", async () => {
  const actual = await vi.importActual<typeof ClockModule>("../../../lib/simulation/clock");
  return { ...actual, useBusinessNow: () => mocks.now };
});
vi.mock("../api", () => ({
  encodeScanPayload: (kind: string, id: string, token: string) => `sion:${kind}:${id}:${token}`,
  useExitPermitQuery: () => ({
    data: mocks.detail,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCancelExitPermitMutation: () => ({ mutateAsync: mocks.cancel, isPending: false }),
  useIssueGateTokenMutation: () => ({ mutate: vi.fn(), data: mocks.gate, isPending: false }),
  useScanExitPermitStageMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateExitPermitMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("./stage-scan-dialog", () => ({
  StageScanDialog: (props: unknown) => {
    mocks.scanDialog(props);
    return null;
  },
}));

import {
  ActiveExitPermitCard,
  ExitPermitDetail as ExitPermitDetailView,
} from "./exit-permit-detail";

function detail(status: "in_progress" | "approved"): ExitPermitDetail {
  const stages = [
    {
      key: "duty_teacher",
      label: "Guru piket",
      approver_rule: "any_teacher",
      verification: "qr_scan" as const,
    },
    {
      key: "counselor",
      label: "Guru BK",
      approver_rule: "duty:counselor",
      verification: "qr_scan" as const,
    },
  ];
  return {
    instance: {
      id: PERMIT_ID,
      kind: "exit_permit",
      status,
      current_stage_index: 0,
      stages,
      ...(status === "in_progress" ? { current_stage: stages[0] } : {}),
      subject_user_id: "student-1",
      opened_at: "2026-09-29T00:10:00Z",
    },
    destination: "Puskesmas",
    start_period_id: "p1",
    end_period_id: "p2",
    student_name: "Siswa Satu",
    class_name: "10 A",
    return_required: true,
  };
}

beforeEach(() => {
  // jsdom has no layout, so no scrollIntoView.
  Element.prototype.scrollIntoView = mocks.scrollIntoView;
  mocks.scrollIntoView.mockReset();
  mocks.reducedMotion = false;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)" && mocks.reducedMotion,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  mocks.cancel.mockReset();
  mocks.cancel.mockResolvedValue(undefined);
  mocks.gate = undefined;
  mocks.scanDialog.mockReset();
  mocks.now = new Date("2026-09-29T03:30:00Z");
  mocks.periods = [];
});

describe("ActiveExitPermitCard", () => {
  it("never shows the permit's raw id: the picket stage is approved by scanning the desk QR", () => {
    mocks.detail = detail("in_progress");
    render(<ActiveExitPermitCard id={PERMIT_ID} />);
    expect(screen.queryByText(PERMIT_ID)).not.toBeInTheDocument();
    expect(screen.queryByText("code")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "hero.scanStage:Guru piket" })).toBeInTheDocument();
  });

  it("names the approved stage on a scan, and points to the gate QR after the last one", () => {
    mocks.detail = detail("in_progress");
    render(<ActiveExitPermitCard id={PERMIT_ID} />);

    const props = mocks.scanDialog.mock.calls.at(-1)?.[0] as {
      successMessage: (result: { instance: { status: string } }) => string;
    };
    expect(props.successMessage({ instance: { status: "in_progress" } })).toBe(
      "stageApproved:Guru piket",
    );
    expect(props.successMessage({ instance: { status: "approved" } })).toBe("approvedAwaitGate");
  });

  it("asks before cancelling, and cancels only on confirm", async () => {
    mocks.detail = detail("in_progress");
    render(<ActiveExitPermitCard id={PERMIT_ID} />);

    await userEvent.click(screen.getByRole("button", { name: "cancel" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("cancelConfirm.title")).toBeInTheDocument();
    expect(mocks.cancel).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "cancelConfirm.keep" }));
    expect(mocks.cancel).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "cancel" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "cancelConfirm.confirm" }),
    );
    expect(mocks.cancel).toHaveBeenCalledWith(PERMIT_ID);
  });

  it("prints no token under the gate QR", () => {
    mocks.detail = detail("approved");
    mocks.gate = { token: GATE_TOKEN, expires_at: new Date(Date.now() + 60_000).toISOString() };
    render(<ActiveExitPermitCard id={PERMIT_ID} />);
    expect(screen.getByRole("img", { name: "gateQrLabel" })).toBeInTheDocument();
    expect(screen.queryByText(GATE_TOKEN)).not.toBeInTheDocument();
  });

  it("shows a day-long gate QR as a time, first, scrolled into view, with the stages folded", async () => {
    mocks.detail = detail("approved");
    mocks.gate = {
      token: GATE_TOKEN,
      expires_at: new Date(Date.now() + 8 * 3600_000).toISOString(),
    };
    render(<ActiveExitPermitCard id={PERMIT_ID} />);

    expect(screen.getByText("validUntil")).toBeInTheDocument();
    expect(screen.queryByText("expiresIn")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "renew" })).not.toBeInTheDocument();
    expect(mocks.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth" }),
    );

    // The QR comes before the finished stages, which sit behind one line.
    const qr = screen.getByRole("img", { name: "gateQrLabel" });
    const stages = screen.getByRole("button", { name: "stagesApproved" });
    expect(qr.compareDocumentPosition(stages) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(stages).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByText("Guru piket")[0]).not.toBeVisible();
    await userEvent.click(stages);
    expect(screen.getAllByText("Guru piket")[0]).toBeVisible();
  });

  it("jumps to the gate QR without a smooth scroll when the user asked for reduced motion", () => {
    mocks.reducedMotion = true;
    mocks.detail = detail("approved");
    mocks.gate = {
      token: GATE_TOKEN,
      expires_at: new Date(Date.now() + 8 * 3600_000).toISOString(),
    };
    render(<ActiveExitPermitCard id={PERMIT_ID} />);
    expect(mocks.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "auto" });
  });
});

// The permit's last lesson, p2, ends at 11.00 in Asia/Makassar (03:00Z).
const PERMIT_PERIODS = [
  { id: "p1", name: "Jam 1", starts_at: "07:00:00", ends_at: "07:45:00", is_break: false },
  { id: "p2", name: "Jam 2", starts_at: "10:15:00", ends_at: "11:00:00", is_break: false },
];

describe("ActiveExitPermitCard once the permit's lessons are over", () => {
  it("offers the gate QR while the last lesson is still running", () => {
    mocks.periods = PERMIT_PERIODS;
    mocks.now = new Date("2026-09-29T02:59:00Z");
    mocks.detail = detail("approved");
    render(<ActiveExitPermitCard id={PERMIT_ID} />);

    expect(screen.getByRole("button", { name: "showGateQr" })).toBeInTheDocument();
    expect(screen.queryByText("hero.lessonsOver")).not.toBeInTheDocument();
  });

  // The regression: the button stayed, and the API could only answer
  // EXIT_PERMIT_PERIOD_PASSED.
  it("says the lessons are over instead of offering a gate QR the API refuses", () => {
    mocks.periods = PERMIT_PERIODS;
    mocks.now = new Date("2026-09-29T03:00:00Z");
    mocks.detail = detail("approved");
    render(<ActiveExitPermitCard id={PERMIT_ID} />);

    expect(screen.queryByRole("button", { name: "showGateQr" })).not.toBeInTheDocument();
    expect(screen.getByText("hero.lessonsOver")).toBeInTheDocument();
  });

  // A QR minted at 10.30 stayed on screen with "Berlaku sampai" after the
  // last lesson ended, and the gate let the student out late.
  it("takes down a gate QR shown before the lessons ended", () => {
    mocks.periods = PERMIT_PERIODS;
    mocks.detail = detail("approved");
    mocks.gate = {
      token: GATE_TOKEN,
      expires_at: new Date(Date.now() + 8 * 3600_000).toISOString(),
    };
    mocks.now = new Date("2026-09-29T02:30:00Z");
    const { rerender } = render(<ActiveExitPermitCard id={PERMIT_ID} />);
    expect(screen.getByRole("img", { name: "gateQrLabel" })).toBeInTheDocument();

    mocks.now = new Date("2026-09-29T03:40:00Z");
    rerender(<ActiveExitPermitCard id={PERMIT_ID} />);

    expect(screen.queryByRole("img", { name: "gateQrLabel" })).not.toBeInTheDocument();
    expect(screen.getByText("hero.lessonsOver")).toBeInTheDocument();
  });

  it("stops asking for a stage's QR once the lessons of a pending permit are over", () => {
    mocks.periods = PERMIT_PERIODS;
    mocks.now = new Date("2026-09-29T03:10:00Z");
    mocks.detail = detail("in_progress");
    render(<ActiveExitPermitCard id={PERMIT_ID} />);

    expect(
      screen.queryByRole("button", { name: "hero.scanStage:Guru piket" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("hero.lessonsOverPending")).toBeInTheDocument();
    // The student can still withdraw it.
    expect(screen.getByRole("button", { name: "cancel" })).toBeInTheDocument();
  });

  it("reads a permit from an earlier school day as over, whatever the time now", () => {
    mocks.periods = PERMIT_PERIODS;
    // 08.00 the next day in Asia/Makassar: before p2's 11.00 end by the clock.
    mocks.now = new Date("2026-09-30T00:00:00Z");
    mocks.detail = detail("approved");
    render(<ActiveExitPermitCard id={PERMIT_ID} />);

    expect(screen.queryByRole("button", { name: "showGateQr" })).not.toBeInTheDocument();
    expect(screen.getByText("hero.lessonsOver")).toBeInTheDocument();
  });
});

/** Through the gate at 10.15 (02:15Z), due back at 11.00 (03:00Z). */
function exited(extra: Partial<ExitPermitDetail> = {}): ExitPermitDetail {
  const base = detail("approved");
  return {
    ...base,
    instance: { ...base.instance, status: "completed" },
    exited_at: "2026-09-29T02:15:00Z",
    expected_return_at: "2026-09-29T03:00:00Z",
    ...extra,
  };
}

// The regression: half an hour past the return time the card still said
// only "Sudah keluar", with no return time and no warning.
describe("ActiveExitPermitCard after the gate", () => {
  it("says when the student is due back while there is still time", () => {
    mocks.now = new Date("2026-09-29T02:30:00Z");
    mocks.detail = exited();
    render(<ActiveExitPermitCard id={PERMIT_ID} />);

    expect(screen.getByText("hero.exitedEyebrow")).toBeInTheDocument();
    expect(screen.getByText("hero.notBackChip")).toBeInTheDocument();
    expect(screen.getByText(/hero\.dueBack/)).toBeInTheDocument();
    expect(screen.queryByText("lateBy")).not.toBeInTheDocument();
  });

  it("marks the student late once the return time has passed", () => {
    mocks.now = new Date("2026-09-29T03:30:00Z");
    mocks.detail = exited();
    render(<ActiveExitPermitCard id={PERMIT_ID} />);

    expect(screen.getByText("lateBy")).toBeInTheDocument();
    expect(screen.getByText(/hero\.wasDueBack/)).toBeInTheDocument();
  });

  it("stops counting late minutes once the exit day is over", () => {
    // 08.00 the next day in Asia/Makassar.
    mocks.now = new Date("2026-09-30T00:00:00Z");
    mocks.detail = exited();
    render(<ActiveExitPermitCard id={PERMIT_ID} />);

    expect(screen.getByText("hero.unrecordedChip")).toBeInTheDocument();
    expect(screen.queryByText("lateBy")).not.toBeInTheDocument();
  });

  it("says the student is back, and that the return was late", () => {
    mocks.detail = exited({ returned_at: "2026-09-29T03:20:00Z", returned_late: true });
    render(<ActiveExitPermitCard id={PERMIT_ID} />);

    expect(screen.getByText("hero.returnedEyebrow")).toBeInTheDocument();
    expect(screen.getByText("lateBy")).toBeInTheDocument();
    expect(screen.getByText(/hero\.returnedAt/)).toBeInTheDocument();
  });

  it("says when a student came back without judging a return that had no due time", () => {
    mocks.detail = exited({ expected_return_at: undefined, returned_at: "2026-09-29T03:20:00Z" });
    render(<ActiveExitPermitCard id={PERMIT_ID} />);

    expect(screen.getByText("hero.returnedEyebrow")).toBeInTheDocument();
    expect(screen.getByText(/hero\.returnedAt/)).toBeInTheDocument();
    expect(screen.queryByText("lateBy")).not.toBeInTheDocument();
    expect(screen.queryByText("onTime")).not.toBeInTheDocument();
  });

  it("keeps the plain exited card for a student who went home", () => {
    mocks.detail = exited({ return_required: false, expected_return_at: undefined });
    render(<ActiveExitPermitCard id={PERMIT_ID} />);

    expect(screen.getByText("hero.exitedEyebrow")).toBeInTheDocument();
    expect(screen.queryByText("hero.notBackChip")).not.toBeInTheDocument();
    expect(screen.queryByText("lateBy")).not.toBeInTheDocument();
  });
});

describe("ExitPermitDetail return line", () => {
  it("tells a late return in the permit's facts", () => {
    mocks.detail = exited({ returned_at: "2026-09-29T03:20:00Z", returned_late: true });
    render(<ExitPermitDetailView id={PERMIT_ID} />);

    expect(screen.getByText("returnLabel")).toBeInTheDocument();
    expect(screen.getByText("returnedLate")).toBeInTheDocument();
  });

  // A week on, the line read "terlambat 11655 menit dari pukul 07.45".
  it("says a return never recorded on the exit day is unrecorded, with no minute count", () => {
    mocks.now = new Date("2026-10-06T02:00:00Z");
    mocks.detail = exited();
    render(<ExitPermitDetailView id={PERMIT_ID} />);

    expect(screen.getByText("notRecordedBack")).toBeInTheDocument();
    expect(screen.queryByText("notBackLate")).not.toBeInTheDocument();
  });

  it("says a student who went home is not coming back", () => {
    mocks.detail = exited({ return_required: false, expected_return_at: undefined });
    render(<ExitPermitDetailView id={PERMIT_ID} />);

    expect(screen.getByText("noReturn")).toBeInTheDocument();
  });

  // Migration 0140 keeps return_required on permits that exited before
  // returns were tracked, with no due time: whether that student came back
  // is unknown, so nothing is said either way.
  it("says nothing about the return of a permit that exited before returns were tracked", () => {
    mocks.detail = exited({ expected_return_at: undefined });
    render(<ExitPermitDetailView id={PERMIT_ID} />);

    expect(screen.queryByText("returnLabel")).not.toBeInTheDocument();
    expect(screen.queryByText("noReturn")).not.toBeInTheDocument();
  });

  it("tells a return imported without a due time, with no on-time or late verdict", () => {
    mocks.detail = exited({ expected_return_at: undefined, returned_at: "2026-09-29T03:20:00Z" });
    render(<ExitPermitDetailView id={PERMIT_ID} />);

    expect(screen.getByText("hero.returnedAt")).toBeInTheDocument();
    expect(screen.queryByText("returnedLate")).not.toBeInTheDocument();
    expect(screen.queryByText("returnedOnTime")).not.toBeInTheDocument();
  });
});
