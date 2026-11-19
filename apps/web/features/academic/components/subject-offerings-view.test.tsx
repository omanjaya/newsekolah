import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import { useMemo } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gradeLevels: undefined as { data: { id: string; name: string }[] } | undefined,
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
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
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
});
