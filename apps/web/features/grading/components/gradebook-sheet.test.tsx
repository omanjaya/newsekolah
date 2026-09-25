import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

vi.mock("../../../components/report-export-dialog", () => ({
  ReportExportDialog: () => <div data-testid="report-export-dialog" />,
}));

const sheetFixture = {
  class_id: "class-1",
  subject_id: "subject-1",
  term_id: "term-1",
  is_published: false,
  scale: { min: 0, max: 100 },
  components: [],
  students: [],
};

const gradebookQueryMock = vi.hoisted(() =>
  vi.fn(() => ({
    data: sheetFixture,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isRefetching: false,
  })),
);

vi.mock("../api", () => ({
  useGradebookQuery: gradebookQueryMock,
  useClassStarBalancesQuery: () => ({ data: { data: [] } }),
  useSetGradePublicationMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [] }, isLoading: false }),
  useGradeLevelsQuery: () => ({ data: { data: [] }, isLoading: false }),
}));

vi.mock("./component-dialog", () => ({ ComponentDialog: () => null }));
vi.mock("./gradebook-export-scope-picker", () => ({
  GradebookExportScopePicker: () => null,
}));
vi.mock("./gradebook-table", () => ({
  GradebookTable: () => <div data-testid="gradebook-table" />,
}));
vi.mock("./manual-score-dialog", () => ({ ManualScoreDialog: () => null }));
vi.mock("./star-dialog", () => ({ StarDialog: () => null }));

import { GradebookSheet } from "./gradebook-sheet";

afterEach(() => {
  cleanup();
});

/**
 * docs/analysis/ux-audit-2026-09-25.md Finding 4: a principal holding
 * view_grades but not manage_grades (canManage=false here, exactly
 * GradingView's `canManage={canManageGrades}` for that role) must not
 * see the "Terbitkan ke siswa" publish switch at all, whether enabled or
 * disabled -- only the read-only Draft/Published status badge.
 */
describe("GradebookSheet publish controls", () => {
  it("hides the publish switch for a read-only viewer (view_grades only)", () => {
    render(<GradebookSheet classId="class-1" subjectId="subject-1" canManage={false} />);

    // The read-only status stays visible...
    expect(screen.getByText("draftBadge")).toBeInTheDocument();
    // ...but the edit control does not render at all (not just disabled).
    expect(screen.queryByText("publishToggleLabel")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("shows the publish switch for a manager (manage_grades)", () => {
    render(<GradebookSheet classId="class-1" subjectId="subject-1" canManage={true} />);

    expect(screen.getByText("draftBadge")).toBeInTheDocument();
    expect(screen.getByText("publishToggleLabel")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });
});
