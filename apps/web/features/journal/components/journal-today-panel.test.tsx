import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { JournalTodayPanel } from "./journal-today-panel";

const schedulesData = vi.hoisted(() => ({ value: [] as unknown[] }));
const journalsData = vi.hoisted(() => ({ value: [] as unknown[] }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
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
  useSchedulesQuery: () => ({ data: { data: schedulesData.value }, isLoading: false }),
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
  schedulesData.value = [];
  journalsData.value = [];
});
afterEach(cleanup);

it("renders nothing when there is no recent lesson at all", () => {
  const { container } = render(<JournalTodayPanel />);
  expect(container).toBeEmptyDOMElement();
});

it("shows today's lessons as bento cards, the odd one spanning the full row", () => {
  schedulesData.value = [
    { schedule_ids: ["s1"], class_id: "class-1", subject_id: "subject-1", day_of_week: WEDNESDAY },
    { schedule_ids: ["s2"], class_id: "class-2", subject_id: "subject-2", day_of_week: WEDNESDAY },
    { schedule_ids: ["s3"], class_id: "class-3", subject_id: "subject-3", day_of_week: WEDNESDAY },
  ];
  render(<JournalTodayPanel />);

  const grid = screen.getByTestId("journal-today-cards");
  expect(grid).toBeInTheDocument();

  const cells = screen.getAllByTestId(/^journal-today-cell-/);
  expect(cells).toHaveLength(3);
  // Three cards: the last one is the odd one out and spans the full row.
  expect(cells[2]?.className).toContain("lg:col-span-2");
  expect(cells[0]?.className).not.toContain("lg:col-span-2");
});

it("gives an unfilled lesson a primary 'write journal' action and a filled one a secondary 'view' action", async () => {
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

  const unfilledCard = screen.getByTestId("journal-today-card-s1");
  const filledCard = screen.getByTestId("journal-today-card-s2");
  const writeButton = within(unfilledCard).getByRole("button", { name: "writePrimary" });
  const viewButton = within(filledCard).getByRole("button", { name: "editAction" });
  expect(writeButton).toBeInTheDocument();
  expect(viewButton).toBeInTheDocument();

  await user.click(writeButton);
  expect(await screen.findByTestId("journal-form")).toHaveTextContent("class-1");
});
