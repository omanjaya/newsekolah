import type * as UiModule from "@newsekolah/ui";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { JournalView } from "./journal-view";

const query = vi.hoisted(() => vi.fn());
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
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => true }));
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
vi.mock("./journal-today-panel", () => ({ JournalTodayPanel: () => null }));
vi.mock("../api", () => ({
  useJournalsQuery: query,
  useDeleteJournalMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  downloadJournalExport: vi.fn(),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

beforeEach(() => {
  query.mockReset();
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
  expect(query).toHaveBeenLastCalledWith(undefined, 0, 50, undefined);
  await user.click(screen.getByRole("button", { name: /berikut|next/i }));
  expect(query).toHaveBeenLastCalledWith(undefined, 1, 50, undefined);
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

  expect(query).toHaveBeenLastCalledWith("class-1", 0, 50, undefined);
  expect(new URLSearchParams(window.location.search).get("class_id")).toBe("class-1");
});
