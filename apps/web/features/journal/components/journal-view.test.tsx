import type * as UiModule from "@newsekolah/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { LessonDayGroup } from "../lib/build-lesson-days";

import { JournalView } from "./journal-view";

const query = vi.hoisted(() => vi.fn());
const todayData = vi.hoisted(() =>
  vi.fn(() => ({
    loading: false,
    isError: false,
    refetch: vi.fn(),
    today: "2026-09-23",
    yesterday: "2026-09-22",
    groups: [] as LessonDayGroup[],
    classMap: new Map(),
    subjectMap: new Map(),
    journalByKey: new Map(),
  })),
);
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
  useFormatter: () => ({ dateTime: (value: Date) => value.toISOString().slice(0, 10) }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/journal",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../lib/hooks/use-active-year", () => ({ useActiveYear: () => ({ id: "year-1" }) }));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => true,
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (key: string) => key,
}));
vi.mock("../../../lib/view-state/view-state-provider", () => ({
  useRememberedViewState: () => ["", vi.fn()],
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [{ id: "class-1", name: "Kelas X-A" }] } }),
  useSubjectsQuery: () => ({ data: { data: [] } }),
  useLookup: () => new Map(),
}));
vi.mock("../../academic/components/academic-workspace-links", () => ({
  AcademicWorkspaceLinks: () => null,
}));
vi.mock("./journal-form", () => ({ JournalForm: () => null }));
vi.mock("./journal-today-panel", () => ({
  JournalTodayPanel: () => null,
  useJournalTodayData: todayData,
}));
vi.mock("../api", () => ({
  useJournalsQuery: query,
  useDeleteJournalMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  downloadJournalExport: vi.fn(),
  downloadJournalExportReport: vi.fn(),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

beforeEach(() => {
  query.mockReset();
  todayData.mockClear();
  window.history.replaceState(null, "", "/journal");
});
afterEach(cleanup);

it("requests the next server page instead of paginating only the first fifty journals", async () => {
  query.mockImplementation((_classId: string | undefined, pageIndex: number) => ({
    data: {
      total: 51,
      data: [
        {
          id: `journal-${pageIndex}`,
          lesson_date: "2026-09-18",
          topic: `Page ${pageIndex + 1}`,
          class_id: "class-1",
          subject_id: "subject-1",
        },
      ],
    },
    isLoading: false,
  }));
  const user = userEvent.setup();
  render(<JournalView />);
  expect(query).toHaveBeenLastCalledWith(undefined, 0, 50, undefined, undefined, undefined);
  await user.click(screen.getByRole("button", { name: /berikut|next/i }));
  expect(query).toHaveBeenLastCalledWith(undefined, 1, 50, undefined, undefined, undefined);
  // DataTable mounts its table and card layouts together (CSS decides
  // which is visible), so the cell text legitimately appears once per
  // layout in the DOM.
  expect(screen.getAllByText("Page 2").length).toBeGreaterThan(0);
});

it("passes the chosen class filter to the query and writes it to the URL state", async () => {
  query.mockReturnValue({ data: { total: 0, data: [] }, isLoading: false });
  const user = userEvent.setup();
  render(<JournalView />);

  await user.click(screen.getByRole("button", { name: "filterClass" }));
  await user.click(await screen.findByRole("button", { name: "Kelas X-A" }));

  expect(query).toHaveBeenLastCalledWith("class-1", 0, 50, undefined, undefined, undefined);
  expect(new URLSearchParams(window.location.search).get("class_id")).toBe("class-1");
});

it("passes the chosen date range to the query and writes it to the URL state", async () => {
  query.mockReturnValue({ data: { total: 0, data: [] }, isLoading: false });
  const user = userEvent.setup();
  render(<JournalView />);

  await user.click(screen.getByRole("button", { name: "filters.dateRange" }));
  fireEvent.change(screen.getByLabelText("filters.from"), {
    target: { value: "2026-09-01" },
  });
  fireEvent.change(screen.getByLabelText("filters.to"), {
    target: { value: "2026-09-30" },
  });

  expect(query).toHaveBeenLastCalledWith(undefined, 0, 50, undefined, "2026-09-01", "2026-09-30");
  expect(new URLSearchParams(window.location.search).get("from")).toBe("2026-09-01");
  expect(new URLSearchParams(window.location.search).get("to")).toBe("2026-09-30");
});

it("shows the journal-this-week and missing-today stat tiles derived from the today-panel data", () => {
  todayData.mockReturnValue({
    loading: false,
    isError: false,
    refetch: vi.fn(),
    today: "2026-09-23",
    yesterday: "2026-09-22",
    groups: [
      {
        date: "2026-09-23",
        lessons: [
          { scheduleId: "a", classId: "class-1", subjectId: "subject-1", filled: false },
          { scheduleId: "b", classId: "class-2", subjectId: "subject-2", filled: true },
        ],
      },
    ],
    classMap: new Map(),
    subjectMap: new Map(),
    journalByKey: new Map(),
  });
  query.mockReturnValue({ data: { total: 0, data: [] }, isLoading: false });
  render(<JournalView />);

  const tiles = screen.getByTestId("journal-tiles");
  expect(tiles).toBeInTheDocument();
  expect(screen.getByTestId("journal-tile-filledWeek")).toHaveTextContent("1");
  expect(screen.getByTestId("journal-tile-missingToday")).toHaveTextContent("1");
});
