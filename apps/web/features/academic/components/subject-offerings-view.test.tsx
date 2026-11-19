import type * as UiModule from "@newsekolah/ui";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gradeLevels: undefined as { data: { id: string; name: string; sequence?: number }[] } | undefined,
  toastSuccess: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations:
    () =>
    (key: string, values?: Record<string, string>): string =>
      values ? `${key} ${Object.values(values).join(" | ")}` : key,
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/hooks/use-active-year", () => ({
  useActiveYear: () => ({ id: "year-1", label: "2026/2027" }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => true }));
vi.mock("../../reference/api", () => ({
  useSubjectsQuery: () => ({ data: { data: [{ id: "physics", name: "Fisika" }] } }),
  useLookup: <T extends { id: string }>(items: T[] | undefined) =>
    useMemo(() => new Map((items ?? []).map((item) => [item.id, item])), [items]),
}));
vi.mock("../api", () => ({
  useAcademicYearsQuery: () => ({ data: { data: [{ id: "year-1", label: "2026/2027" }] } }),
}));
vi.mock("../api-master-data", () => ({
  useGradeLevelsQuery: () => ({ data: mocks.gradeLevels }),
}));
vi.mock("../api-offerings", () => ({
  useSubjectOfferingsQuery: () => ({
    data: {
      data: [
        { id: "o-10", subject_id: "physics", grade_level_id: "g10", hours_per_week: 4 },
        { id: "o-11", subject_id: "physics", grade_level_id: "g11", hours_per_week: 3 },
        { id: "o-all", subject_id: "physics", grade_level_id: null, hours_per_week: 2 },
      ],
    },
    isLoading: false,
  }),
  useCreateSubjectOfferingMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateSubjectOfferingMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteSubjectOfferingMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: mocks.toastSuccess, error: vi.fn() }) };
});

import { SubjectOfferingsView } from "./subject-offerings-view";

const PAGE = { description: "", nav: null, toolbar: null };

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

beforeEach(() => {
  mocks.gradeLevels = undefined;
  mocks.toastSuccess.mockReset();
});

describe("SubjectOfferingsView", () => {
  it("shows grade level names that load after the offerings", () => {
    const view = render(<SubjectOfferingsView page={PAGE} />);
    expect(screen.queryByText("Kelas X")).not.toBeInTheDocument();

    mocks.gradeLevels = {
      data: [
        { id: "g10", name: "Kelas X" },
        { id: "g11", name: "Kelas XI" },
      ],
    };
    view.rerender(<SubjectOfferingsView page={PAGE} />);

    expect(screen.getAllByText("Kelas X").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Kelas XI").length).toBeGreaterThan(0);
  });

  it("names the subject and the grade level on each row's actions menu", () => {
    mocks.gradeLevels = {
      data: [
        { id: "g10", name: "Kelas X" },
        { id: "g11", name: "Kelas XI" },
      ],
    };
    render(<SubjectOfferingsView page={PAGE} />);

    expect(
      screen.getAllByRole("button", { name: "rowActions Fisika | Kelas X" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "rowActions Fisika | Kelas XI" }).length,
    ).toBeGreaterThan(0);
  });

  it("names the grade level in the delete confirmation", async () => {
    mocks.gradeLevels = { data: [{ id: "g10", name: "Kelas X" }] };
    const user = userEvent.setup();
    render(<SubjectOfferingsView page={PAGE} />);

    const [menuButton] = screen.getAllByRole("button", { name: "rowActions Fisika | Kelas X" });
    if (!menuButton) throw new Error("no row actions for Fisika, Kelas X");
    await user.click(menuButton);
    await user.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", { name: "delete" }),
    );
    // Only this grade's offering goes; the copy must say which grade.
    expect(await screen.findByText("deleteBody Fisika | Kelas X")).toBeInTheDocument();
  });

  it("says an offering to every grade goes for all grades", async () => {
    const user = userEvent.setup();
    render(<SubjectOfferingsView page={PAGE} />);

    const [menuButton] = screen.getAllByRole("button", { name: "rowActions Fisika | allGrades" });
    if (!menuButton) throw new Error("no row actions for the all-grades offering");
    await user.click(menuButton);
    await user.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", { name: "delete" }),
    );
    expect(await screen.findByText("deleteBodyAllGrades Fisika")).toBeInTheDocument();

    // The toast uses the same all-grades wording, not "for All grade levels".
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "delete" }));
    expect(mocks.toastSuccess).toHaveBeenCalledWith("deletedAllGrades Fisika");
  });

  it("sorts by grade level in the school's sequence, not by name", async () => {
    // By name "Kelas XI" would come after "Kelas X"; the sequence puts it first.
    mocks.gradeLevels = {
      data: [
        { id: "g10", name: "Kelas X", sequence: 2 },
        { id: "g11", name: "Kelas XI", sequence: 1 },
      ],
    };
    const user = userEvent.setup();
    render(<SubjectOfferingsView page={PAGE} />);

    const table = screen.getByRole("table");
    await user.click(within(table).getByRole("button", { name: "columns.gradeLevel" }));
    const order = within(table)
      .getAllByRole("button", { name: /^rowActions / })
      .map((button) => button.getAttribute("aria-label"));
    expect(order).toEqual([
      "rowActions Fisika | allGrades",
      "rowActions Fisika | Kelas XI",
      "rowActions Fisika | Kelas X",
    ]);
  });
});
