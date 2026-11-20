import { ApiError } from "@newsekolah/api-client";
import type * as Ui from "@newsekolah/ui";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ClockModule from "../../../lib/simulation/clock";
import type * as PermitsApi from "../api";

const mocks = vi.hoisted(() => ({
  scanGate: vi.fn(),
  recordReturn: vi.fn(),
  toastSuccess: vi.fn(),
  out: [] as PermitsApi.ExitPermitAwaitingReturn[],
  now: new Date("2027-02-16T03:30:00Z"),
}));

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, values?: Record<string, string | number>) =>
    values ? `${ns}.${key}:${Object.values(values).join(",")}` : `${ns}.${key}`,
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => `errors.${code}`,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { disabled_modules: [], tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../../lib/simulation/clock", async () => {
  const actual = await vi.importActual<typeof ClockModule>("../../../lib/simulation/clock");
  return { ...actual, useBusinessNow: () => mocks.now };
});
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof PermitsApi>();
  return {
    ...actual,
    useScanGateMutation: () => ({ mutateAsync: mocks.scanGate, isPending: false }),
    useExitPermitsAwaitingReturnQuery: () => ({
      data: { data: mocks.out },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useRecordExitPermitReturnMutation: () => ({
      mutateAsync: mocks.recordReturn,
      isPending: false,
    }),
  };
});
vi.mock("@newsekolah/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof Ui>();
  return {
    ...actual,
    useToast: () => ({ success: mocks.toastSuccess, error: vi.fn() }),
    // A stand-in for the camera scanner: one button sends a gate payload.
    Scanner: ({
      onScan,
      result,
    }: {
      onScan: (event: { code: string }) => Promise<boolean>;
      result: { title: string; description?: string } | null;
    }) => (
      <div>
        <button type="button" onClick={() => void onScan({ code: "sion:gate:inst-1:tok" })}>
          scan
        </button>
        {result && <p data-testid="result">{result.description}</p>}
      </div>
    ),
  };
});

import { GatePanel } from "./exit-permit-panels";

function out(
  id: string,
  extra: Partial<PermitsApi.ExitPermitAwaitingReturn> = {},
): PermitsApi.ExitPermitAwaitingReturn {
  return {
    instance_id: id,
    student_user_id: `student-${id}`,
    destination: "Puskesmas",
    student_name: "Siswa Contoh",
    class_name: "X-A",
    exited_at: "2027-02-16T02:15:00Z",
    expected_return_at: "2027-02-16T04:00:00Z",
    overdue: false,
    unrecorded: false,
    ...extra,
  };
}

beforeEach(() => {
  mocks.scanGate.mockReset();
  mocks.recordReturn.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.out = [];
  mocks.now = new Date("2027-02-16T03:30:00Z");
});

describe("GatePanel", () => {
  it("tells the guard to ask the student for a new code when the gate QR is gone", async () => {
    mocks.scanGate.mockRejectedValue(
      new ApiError({ status: 410, code: "SCAN_TOKEN_GONE", message: "gone" }),
    );
    render(<GatePanel />);

    fireEvent.click(screen.getByRole("button", { name: "scan" }));

    const result = await screen.findByTestId("result");
    expect(result).toHaveTextContent("app.permits.exit.gate.tokenGone");
    expect(result).not.toHaveTextContent("errors.SCAN_TOKEN_GONE");
  });

  it("keeps the shared error copy for other refusals", async () => {
    mocks.scanGate.mockRejectedValue(
      new ApiError({ status: 409, code: "WORKFLOW_NOT_APPROVED", message: "no" }),
    );
    render(<GatePanel />);

    fireEvent.click(screen.getByRole("button", { name: "scan" }));

    expect(await screen.findByTestId("result")).toHaveTextContent("errors.WORKFLOW_NOT_APPROVED");
  });
});

describe("GatePanel not-back-yet list", () => {
  it("says no student is out when the list is empty", () => {
    render(<GatePanel />);

    expect(screen.getByText("app.permits.exit.gate.outEmpty")).toBeInTheDocument();
  });

  // A missing return dropped off the list the next morning without a
  // trace; it now stays a week, apart from today's, with no record action.
  it("keeps a past day's missing return in its own section, without Catat kembali", () => {
    mocks.out = [
      out("old", {
        student_name: "Siswa Lama",
        exited_at: "2027-02-11T02:15:00Z",
        expected_return_at: "2027-02-11T03:00:00Z",
        overdue: true,
        unrecorded: true,
      }),
    ];
    render(<GatePanel />);

    expect(screen.getByText("app.permits.exit.gate.outEmpty")).toBeInTheDocument();
    const section = screen.getByRole("region", { name: "app.permits.exit.gate.unrecordedTitle" });
    const [row] = within(section).getAllByRole("listitem");
    expect(row).toHaveTextContent("Siswa Lama");
    expect(row).toHaveTextContent("app.permits.exit.gate.unrecordedBadge");
    expect(row).toHaveTextContent("app.permits.exit.gate.dueBack:10.00");
    expect(within(section).queryByRole("button")).not.toBeInTheDocument();
  });

  it("lists who is still out with the time they are due back", () => {
    mocks.out = [out("a")];
    render(<GatePanel />);

    const [row] = screen.getAllByRole("listitem");
    expect(row).toHaveTextContent("Siswa Contoh");
    expect(row).toHaveTextContent("app.permits.exit.gate.dueBack:11.00");
    expect(row).not.toHaveTextContent("app.permits.exit.gate.overdue");
  });

  // The regression: at 11.30, half an hour past an 11.00 return time, the
  // gate showed only who had just left, and nothing marked the late one.
  it("marks a student past the due time as late, by the minutes on the clock", () => {
    mocks.now = new Date("2027-02-16T04:30:00Z");
    mocks.out = [out("a", { overdue: true })];
    render(<GatePanel />);

    const row = screen.getByRole("listitem");
    expect(within(row).getByText("app.permits.exit.gate.overdue:30")).toBeInTheDocument();
  });

  it("records the student back from their row", async () => {
    mocks.recordReturn.mockResolvedValue(undefined);
    mocks.out = [out("a"), out("b", { student_name: "Rina Kartika" })];
    render(<GatePanel />);

    fireEvent.click(
      screen.getByRole("button", { name: "app.permits.exit.gate.recordReturnFor:Rina Kartika" }),
    );

    await vi.waitFor(() => {
      expect(mocks.recordReturn).toHaveBeenCalledWith("b");
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "app.permits.exit.gate.returnedToast:Rina Kartika",
    );
  });
});
