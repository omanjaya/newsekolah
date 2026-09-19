import type * as UiModule from "@newsekolah/ui";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { JournalView } from "./journal-view";

const query = vi.hoisted(() => vi.fn());
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/hooks/use-active-year", () => ({ useActiveYear: () => ({ id: "year-1" }) }));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => true }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (key: string) => key,
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [] } }),
  useSubjectsQuery: () => ({ data: { data: [] } }),
  useLookup: () => new Map(),
}));
vi.mock("./journal-form", () => ({ JournalForm: () => null }));
vi.mock("../api", () => ({
  useJournalsQuery: query,
  useDeleteJournalMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  downloadJournalExport: vi.fn(),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
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
  expect(query).toHaveBeenLastCalledWith(undefined, 0, 50);
  await user.click(screen.getByRole("button", { name: /berikut|next/i }));
  expect(query).toHaveBeenLastCalledWith(undefined, 1, 50);
  // DataTable mounts its table and card layouts together (CSS decides
  // which is visible), so the cell text legitimately appears once per
  // layout in the DOM.
  expect(screen.getAllByText("Page 2").length).toBeGreaterThan(0);
});
