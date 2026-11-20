import type * as UiModule from "@newsekolah/ui";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

import type * as TenantDateModule from "../../../lib/tenant-date";

const create = vi.hoisted(() => vi.fn());
const schedules = vi.hoisted(() => ({
  filter: undefined,
  blocks: [] as Record<string, unknown>[],
}));

vi.mock("next-intl", () => ({
  useLocale: () => "id",
  useTranslations: () => (key: string) => key,
}));
vi.mock("../../../lib/hooks/use-active-year", () => ({
  useActiveYear: () => ({ id: "year-1", label: "2026/2027" }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { id: "me", tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../../../lib/tenant-date", async () => {
  const actual = await vi.importActual<typeof TenantDateModule>("../../../lib/tenant-date");
  // Friday 20 November 2026 is the school's today.
  return { ...actual, todayInZone: () => "2026-11-20" };
});
vi.mock("../../calendar/api", () => ({
  useCalendarEventsQuery: () => ({
    data: {
      data: [
        {
          id: "e1",
          name: "Libur",
          date: "2026-11-30",
          end_date: "2026-11-30",
          kind: "holiday",
          academic_year_id: "year-1",
        },
      ],
    },
  }),
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [{ id: "class-1", name: "X-A" }] } }),
  useSubjectsQuery: () => ({ data: { data: [{ id: "subject-1", name: "Matematika" }] } }),
  useLookup: (items: { id: string }[] | undefined) =>
    new Map((items ?? []).map((item) => [item.id, item])),
}));
vi.mock("../../schedule/api", () => ({
  useSchedulesQuery: (filter: unknown) => {
    schedules.filter = filter;
    return { data: { data: schedules.blocks } };
  },
}));
vi.mock("../api", () => ({
  useCreateSubstitutionMutation: () => ({ mutateAsync: create, isPending: false }),
  useEligibleSubstitutesQuery: () => ({ data: { data: [] }, isLoading: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { RequestForm } from "./request-form";

beforeAll(() => {
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
afterEach(cleanup);
beforeEach(() => {
  schedules.blocks = [
    {
      schedule_ids: ["s1"],
      class_id: "class-1",
      subject_id: "subject-1",
      day_of_week: 1,
      effective_from: "2026-07-13",
    },
  ];
});

it("marks the lesson, date and substitute as required up front", () => {
  render(<RequestForm onDone={vi.fn()} />);

  for (const name of ["schedule", "date"]) {
    expect(screen.getByRole("combobox", { name })).toHaveAttribute("aria-required", "true");
  }
  // The substitute picker's trigger is a button, which says it is required
  // in its description instead.
  expect(screen.getByRole("button", { name: "substitute" })).toHaveAttribute("aria-describedby");
});

it("shows each missing field's own error on Send and focuses the first, with no banner", async () => {
  const user = userEvent.setup();
  render(<RequestForm onDone={vi.fn()} initialScheduleId="s1" />);

  await user.click(screen.getByRole("button", { name: "send" }));

  expect(create).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  // The lesson was given; the date and the substitute were not.
  expect(screen.getByRole("combobox", { name: "schedule" })).not.toHaveAttribute("aria-invalid");
  const date = screen.getByRole("combobox", { name: "date" });
  expect(date).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("button", { name: "substitute" })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await waitFor(() => {
    expect(date).toHaveFocus();
  });
});

it("offers only future dates on the lesson's weekday that are not holidays", async () => {
  const user = userEvent.setup();
  render(<RequestForm onDone={vi.fn()} initialScheduleId="s1" />);

  expect(screen.getByText("dateHint")).toBeInTheDocument();
  await user.click(screen.getByRole("combobox", { name: "date" }));
  await screen.findByRole("grid");
  const cell = (iso: string) => document.querySelector(`[role="gridcell"][data-date="${iso}"]`);

  // The lesson is on Monday (day 1).
  expect(cell("2026-11-23")).not.toHaveAttribute("aria-disabled");
  // Past Monday, a Tuesday, and the Monday holiday cannot be picked.
  expect(cell("2026-11-16")).toHaveAttribute("aria-disabled", "true");
  expect(cell("2026-11-24")).toHaveAttribute("aria-disabled", "true");
  expect(cell("2026-11-30")).toHaveAttribute("aria-disabled", "true");
});

it("offers the lessons of the week of the date picked, and only that version's dates", async () => {
  // The Monday lesson in this version only starts on 30 November.
  schedules.blocks = [
    {
      schedule_ids: ["s1"],
      class_id: "class-1",
      subject_id: "subject-1",
      day_of_week: 1,
      effective_from: "2026-11-30",
      effective_until: "2026-12-07",
    },
  ];
  const user = userEvent.setup();
  render(<RequestForm onDone={vi.fn()} initialScheduleId="s1" initialDate="2026-12-07" />);

  expect(schedules.filter).toMatchObject({ asOf: "2026-12-07" });
  await user.click(screen.getByRole("combobox", { name: "date" }));
  await screen.findByRole("grid");
  const cell = (iso: string) => document.querySelector(`[role="gridcell"][data-date="${iso}"]`);
  expect(cell("2026-12-07")).not.toHaveAttribute("aria-disabled");
  // A Monday after the version ends cannot be picked.
  expect(cell("2026-12-14")).toHaveAttribute("aria-disabled", "true");
});
