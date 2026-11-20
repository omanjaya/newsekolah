import type * as UiModule from "@newsekolah/ui";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => true,
}));
type Mutate = (days: unknown, options: { onSuccess: () => void }) => void;
const scheduleState = vi.hoisted(() => ({
  days: [] as {
    weekday: number;
    is_working_day: boolean;
    start_minute: number;
    end_minute: number;
    grace_minutes: number;
  }[],
  mutate: undefined as Mutate | undefined,
}));
vi.mock("../api", () => ({
  useStaffAttendanceScheduleQuery: () => ({
    data: { data: scheduleState.days },
    isLoading: false,
  }),
  useReplaceStaffAttendanceScheduleMutation: () => ({
    mutate: (days: unknown, options: { onSuccess: () => void }) => {
      scheduleState.mutate?.(days, options);
    },
    isPending: false,
  }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { ScheduleEditorView } from "./schedule-editor-view";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
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

// Whether the viewport is `sm` or wider; the editor lays the week out as a
// table there and as day cards on a phone.
let wideViewport = true;

beforeEach(() => {
  wideViewport = true;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(min-width: 640px)" ? wideViewport : false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  scheduleState.days = [];
  scheduleState.mutate = (_days, options) => {
    options.onSuccess();
  };
});

async function openFormFor(name: string) {
  render(
    <ScheduleEditorView
      employees={[
        { id: "guru", name: "Guru Contoh", has_schedule: false },
        { id: "satpam", name: "Satpam Contoh", has_schedule: true },
      ]}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "schedule.employee" }));
  await userEvent.click(screen.getByRole("option", { name: new RegExp(name) }));
}

it("does not call an employee without any schedule saved", async () => {
  await openFormFor("Guru Contoh");

  expect(screen.getByText("schedule.notSet")).toBeInTheDocument();
  expect(screen.queryByText("schedule.upToDate")).not.toBeInTheDocument();

  const [monday] = screen.getAllByRole("switch", { name: "schedule.workingDayFor" });
  if (!monday) throw new Error("no working-day switch");
  await userEvent.click(monday);
  expect(screen.getByText("schedule.unsaved")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "schedule.save" }));
  // Once stored, the same week is the saved one.
  expect(screen.getByText("schedule.upToDate")).toBeInTheDocument();
});

it("says the schedule is saved for someone who has one", async () => {
  scheduleState.days = [
    { weekday: 1, is_working_day: true, start_minute: 480, end_minute: 960, grace_minutes: 10 },
  ];
  await openFormFor("Satpam Contoh");

  expect(screen.getByText("schedule.upToDate")).toBeInTheDocument();
  expect(screen.queryByText("schedule.notSet")).not.toBeInTheDocument();
});

it("gives each start and end time a box wide enough for the whole time", async () => {
  scheduleState.days = [
    { weekday: 1, is_working_day: true, start_minute: 480, end_minute: 960, grace_minutes: 10 },
  ];
  await openFormFor("Satpam Contoh");

  // jsdom cannot measure text, so this pins the box width the live check
  // needed: at w-28 the clock and the list toggle left "08.00" 34px of
  // its 38 (desktop) and 22px of its 43 (touch), and it read "08.…".
  for (const label of ["schedule.startFor", "schedule.endFor"]) {
    const [first] = screen.getAllByRole("combobox", { name: label });
    expect(first?.parentElement).toHaveClass("w-36");
    expect(first?.parentElement).not.toHaveClass("w-28");
    expect(first).not.toHaveClass("text-ellipsis");
  }
});

it("offers staff who have no work schedule yet, so a fresh school can give the first one", async () => {
  render(
    <ScheduleEditorView
      employees={[
        { id: "guru", name: "Guru Contoh", has_schedule: false },
        { id: "satpam", name: "Satpam Contoh", has_schedule: true },
      ]}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "schedule.employee" }));

  const guru = screen.getByRole("option", { name: /Guru Contoh/ });
  expect(guru).toHaveTextContent("noSchedule");
  expect(screen.getByRole("option", { name: /Satpam Contoh/ })).not.toHaveTextContent("noSchedule");
  expect(screen.queryByText("empty")).not.toBeInTheDocument();

  await userEvent.click(guru);
  // The weekly form opens for the chosen person.
  expect(screen.getByText("schedule.weekdays.1")).toBeInTheDocument();
});

it("lays the week out as day cards on a phone, with every field of a working day on screen", async () => {
  wideViewport = false;
  scheduleState.days = [
    { weekday: 1, is_working_day: true, start_minute: 480, end_minute: 960, grace_minutes: 10 },
  ];
  await openFormFor("Satpam Contoh");

  // No five-column table to scroll sideways: each day is its own card.
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  const cards = screen.getByTestId("schedule-day-cards");
  expect(within(cards).getAllByRole("switch", { name: "schedule.workingDayFor" })).toHaveLength(7);
  // Monday works, so its start, end and grace minutes are all there, labelled.
  expect(within(cards).getByRole("combobox", { name: "schedule.startFor" })).toBeInTheDocument();
  expect(within(cards).getByRole("combobox", { name: "schedule.endFor" })).toBeInTheDocument();
  expect(within(cards).getByRole("spinbutton", { name: "schedule.graceFor" })).toBeInTheDocument();
  expect(within(cards).getByText("schedule.grace")).toBeInTheDocument();

  // Turning a day on shows its fields.
  const [, tuesday] = within(cards).getAllByRole("switch", { name: "schedule.workingDayFor" });
  if (!tuesday) throw new Error("no Tuesday switch");
  await userEvent.click(tuesday);
  expect(within(cards).getAllByRole("combobox", { name: "schedule.startFor" })).toHaveLength(2);
});

it("keeps the five-column table from sm up", async () => {
  await openFormFor("Satpam Contoh");
  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(screen.queryByTestId("schedule-day-cards")).not.toBeInTheDocument();
});
