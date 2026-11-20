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

import { CreateForm } from "./exit-permit-detail";

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

  it("says the school day is over when no lesson is left", () => {
    mocks.now = new Date("2027-01-13T06:00:00Z");
    render(<CreateForm onDone={vi.fn()} />);

    expect(screen.getByText("noPeriodsLeft")).toBeInTheDocument();
  });
});
