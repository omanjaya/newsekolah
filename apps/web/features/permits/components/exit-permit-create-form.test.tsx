import { ApiError } from "@newsekolah/api-client";
import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ClockModule from "../../../lib/simulation/clock";

const mocks = vi.hoisted(() => ({
  now: new Date("2027-01-13T03:30:00Z"),
  create: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/simulation/clock", async () => {
  const actual = await vi.importActual<typeof ClockModule>("../../../lib/simulation/clock");
  return { ...actual, useBusinessNow: () => mocks.now };
});
vi.mock("../../reference/api", () => ({
  usePeriodsQuery: () => ({
    isSuccess: true,
    data: {
      data: [
        { id: "p1", name: "Jam 1", starts_at: "07:00:00", ends_at: "07:45:00", is_break: false },
        { id: "p5", name: "Jam 5", starts_at: "10:15:00", ends_at: "11:00:00", is_break: false },
        { id: "p6", name: "Jam 6", starts_at: "11:00:00", ends_at: "11:45:00", is_break: false },
        { id: "p7", name: "Jam 7", starts_at: "11:45:00", ends_at: "12:30:00", is_break: false },
      ],
    },
  }),
}));
vi.mock("../api", () => ({
  encodeScanPayload: vi.fn(),
  useExitPermitQuery: vi.fn(),
  useCancelExitPermitMutation: vi.fn(),
  useIssueGateTokenMutation: vi.fn(),
  useScanExitPermitStageMutation: vi.fn(),
  useCreateExitPermitMutation: () => ({ mutateAsync: mocks.create, isPending: false }),
}));

import { CreateForm } from "./exit-permit-create-form";

beforeAll(() => {
  // Radix Select reads pointer-capture and scroll APIs jsdom does not implement.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    },
  );
});

beforeEach(() => {
  mocks.create.mockReset();
});

describe("CreateForm periods", () => {
  it("offers only the lessons still running or to come on the school's clock", async () => {
    // 11.30 in Jakarta: Jam 1 and Jam 5 are over, Jam 6 is running.
    mocks.now = new Date("2027-01-13T04:30:00Z");
    const user = userEvent.setup();
    render(<CreateForm onDone={vi.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "from" }));
    const offered = screen.getAllByRole("option").map((option) => option.textContent);
    expect(offered).toEqual(["Jam 6 (11.00 – 11.45)", "Jam 7 (11.45 – 12.30)"]);
    expect(screen.queryByText("noPeriodsLeft")).not.toBeInTheDocument();
  });

  it("asks the gate to await the student back unless they go home", async () => {
    mocks.now = new Date("2027-01-13T03:00:00Z");
    mocks.create.mockResolvedValue({ instance: { id: "inst-1" } });
    const user = userEvent.setup();
    render(<CreateForm onDone={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: /destination/ }), "Pulang, sakit");
    await user.click(screen.getByRole("combobox", { name: "from" }));
    await user.click(screen.getByRole("option", { name: "Jam 6 (11.00 – 11.45)" }));
    await user.click(screen.getByRole("combobox", { name: "to" }));
    await user.click(screen.getByRole("option", { name: "Jam 7 (11.45 – 12.30)" }));
    const returns = screen.getByRole("checkbox", { name: /returns/ });
    expect(returns).toBeChecked();
    await user.click(returns);
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mocks.create).toHaveBeenCalledWith({
      destination: "Pulang, sakit",
      start_period_id: "p6",
      end_period_id: "p7",
      return_required: false,
    });
  });

  // The shared catalog's "Siswa ini ..." is worded for the duty teacher
  // recording a permit; the student submitting their own is addressed as
  // "Anda", under a title for a refused request, not "check the fields".
  it.each([
    ["STUDENT_ON_LEAVE_TODAY", "onLeaveToday"],
    ["EXIT_PERMIT_ALREADY_TODAY", "alreadyToday"],
  ])("speaks to the student when the API refuses with %s", async (code, own) => {
    mocks.now = new Date("2027-01-13T03:00:00Z");
    mocks.create.mockRejectedValue(new ApiError({ status: 409, code, message: code }));
    const user = userEvent.setup();
    render(<CreateForm onDone={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: /destination/ }), "Puskesmas");
    await user.click(screen.getByRole("combobox", { name: "from" }));
    await user.click(screen.getByRole("option", { name: "Jam 6 (11.00 – 11.45)" }));
    await user.click(screen.getByRole("button", { name: "submit" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("refusedTitle");
    expect(alert).toHaveTextContent(own);
    expect(alert).not.toHaveTextContent(code);
  });

  it("keeps the shared wording and the form title for any other error", async () => {
    mocks.now = new Date("2027-01-13T03:00:00Z");
    mocks.create.mockRejectedValue(
      new ApiError({ status: 422, code: "VALIDATION_FAILED", message: "invalid" }),
    );
    const user = userEvent.setup();
    render(<CreateForm onDone={vi.fn()} />);

    await user.type(screen.getByRole("textbox", { name: /destination/ }), "Puskesmas");
    await user.click(screen.getByRole("combobox", { name: "from" }));
    await user.click(screen.getByRole("option", { name: "Jam 6 (11.00 – 11.45)" }));
    await user.click(screen.getByRole("button", { name: "submit" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("VALIDATION_FAILED");
    expect(alert).not.toHaveTextContent("refusedTitle");
  });

  it("says the school day is over when no lesson is left", () => {
    mocks.now = new Date("2027-01-13T06:00:00Z");
    render(<CreateForm onDone={vi.fn()} />);

    expect(screen.getByText("noPeriodsLeft")).toBeInTheDocument();
  });
});
