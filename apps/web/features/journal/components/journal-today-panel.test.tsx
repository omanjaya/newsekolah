import { ApiError } from "@newsekolah/api-client";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { JournalTodayPanel } from "./journal-today-panel";

const schedulesData = vi.hoisted(() => ({ value: [] as unknown[] }));
const journalsData = vi.hoisted(() => ({ value: [] as unknown[] }));
const canViewSchedules = vi.hoisted(() => ({ value: true }));
const scheduleQuery = vi.hoisted(() => {
  const state: { error: Error | null; isError: boolean; lastFilter: unknown } = {
    error: null,
    isError: false,
    lastFilter: undefined,
  };
  return state;
});

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
  useFormatter: () => ({ dateTime: (value: Date) => value.toISOString().slice(0, 10) }),
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
  useCan: () => canViewSchedules.value,
}));
vi.mock("../../../lib/simulation/clock", () => ({
  useSimulation: () => ({ revision: 0 }),
}));
vi.mock("../../../lib/tenant-date", () => ({
  todayInZone: () => "2026-09-23",
}));
vi.mock("../../../lib/hooks/use-active-year", () => ({
  useActiveYear: () => ({ id: "year-1" }),
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({
    data: {
      data: [
        { id: "class-1", name: "Kelas X-A" },
        { id: "class-2", name: "Kelas X-B" },
        { id: "class-3", name: "Kelas X-C" },
      ],
    },
    isLoading: false,
  }),
  useSubjectsQuery: () => ({
    data: {
      data: [
        { id: "subject-1", name: "Matematika" },
        { id: "subject-2", name: "Bahasa Indonesia" },
        { id: "subject-3", name: "IPA" },
      ],
    },
    isLoading: false,
  }),
  useSchoolDaysQuery: () => ({
    data: { data: [1, 2, 3, 4, 5].map((d) => ({ day_of_week: d, is_active: true })) },
    isLoading: false,
  }),
  useLookup: (items: { id: string }[] | undefined) =>
    new Map((items ?? []).map((item) => [item.id, item])),
}));
vi.mock("../../schedule/api", () => ({
  useSchedulesQuery: (filter: unknown) => {
    scheduleQuery.lastFilter = filter;
    return {
      data: { data: schedulesData.value },
      isLoading: false,
      isError: scheduleQuery.isError,
      error: scheduleQuery.error,
      refetch: vi.fn(),
    };
  },
}));
vi.mock("../api", () => ({
  useJournalsQuery: () => ({ data: { data: journalsData.value }, isLoading: false }),
}));
vi.mock("./journal-form", () => ({
  JournalForm: ({ prefillClassId }: { prefillClassId?: string }) => (
    <div data-testid="journal-form">{prefillClassId}</div>
  ),
}));

// 2026-09-23 is a Wednesday (ISO weekday 3).
const WEDNESDAY = 3;

beforeEach(() => {
  canViewSchedules.value = true;
  scheduleQuery.error = null;
  scheduleQuery.isError = false;
  schedulesData.value = [];
  journalsData.value = [];
});
afterEach(cleanup);

it("renders nothing when there is no recent lesson at all", () => {
  const { container } = render(<JournalTodayPanel />);
  expect(container).toBeEmptyDOMElement();
});

it("lists only the lessons still missing a journal, each with one write action", async () => {
  schedulesData.value = [
    { schedule_ids: ["s1"], class_id: "class-1", subject_id: "subject-1", day_of_week: WEDNESDAY },
    { schedule_ids: ["s2"], class_id: "class-2", subject_id: "subject-2", day_of_week: WEDNESDAY },
  ];
  journalsData.value = [
    {
      id: "journal-1",
      class_id: "class-2",
      subject_id: "subject-2",
      lesson_date: "2026-09-23",
      topic: "Sudah ditulis",
    },
  ];
  const user = userEvent.setup();
  render(<JournalTodayPanel />);

  const backlog = screen.getByTestId("journal-backlog");
  // The written lesson lives in the history table, not in the backlog.
  expect(within(backlog).queryByTestId(/class-2/)).not.toBeInTheDocument();
  const row = within(backlog).getByTestId(/^journal-backlog-class-1/);
  const write = within(row).getByRole("button", { name: "writeFor" });

  await user.click(write);
  expect(await screen.findByTestId("journal-form")).toHaveTextContent("class-1");
});

it("says so calmly once every recent lesson has its journal", () => {
  schedulesData.value = [
    { schedule_ids: ["s2"], class_id: "class-2", subject_id: "subject-2", day_of_week: WEDNESDAY },
  ];
  journalsData.value = [
    {
      id: "journal-1",
      class_id: "class-2",
      subject_id: "subject-2",
      lesson_date: "2026-09-23",
      topic: "Sudah ditulis",
    },
  ];
  render(<JournalTodayPanel />);

  expect(screen.getByText("allWrittenTitle")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "writeFor" })).not.toBeInTheDocument();
});

it("does not request schedules for a viewer without schedule access", () => {
  canViewSchedules.value = false;
  const { container } = render(<JournalTodayPanel />);
  expect(scheduleQuery.lastFilter).toMatchObject({ enabled: false });
  expect(container).toBeEmptyDOMElement();
});

it("treats a 403 from the schedule request as not applicable, not as a load failure", () => {
  scheduleQuery.isError = true;
  scheduleQuery.error = new ApiError({ status: 403, code: "FORBIDDEN", message: "forbidden" });
  const { container } = render(<JournalTodayPanel />);
  expect(container).toBeEmptyDOMElement();
});
