import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));

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
const overridden = {
  student_user_id: "s1",
  name: "Siswa Dua Contoh",
  scores: {},
  average: 86.14,
  report_score: 75.5,
  manual_score: 75.5,
};
vi.mock("./gradebook-table", () => ({
  GradebookTable: ({ onManualOverride }: { onManualOverride: (s: typeof overridden) => void }) => (
    <div data-testid="gradebook-table">
      <button
        type="button"
        onClick={() => {
          onManualOverride(overridden);
        }}
      >
        edit-report-score
      </button>
    </div>
  ),
}));
vi.mock("./manual-score-dialog", () => ({
  ManualScoreDialog: (props: { currentManualScore?: number; computedAverage?: number }) => (
    <div data-testid="manual-score-dialog">
      {JSON.stringify({ current: props.currentManualScore, average: props.computedAverage })}
    </div>
  ),
}));
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
    // The Field's label names the switch; there is no native label of its own.
    expect(screen.getByRole("switch", { name: "publishToggleLabel" })).toBeInTheDocument();
  });
});

describe("GradebookSheet manual report score", () => {
  // grades-discipline-R2: the dialog opened empty on a student with an
  // override, so a plain Simpan removed it.
  afterEach(() => {
    gradebookQueryMock.mockReset();
  });

  it("opens the override dialog on the student's current manual score", () => {
    gradebookQueryMock.mockReturnValue({
      data: {
        ...sheetFixture,
        components: [{ id: "c1", code: "TG1", kind: "formative", weight: 1 }],
        students: [overridden],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isRefetching: false,
    } as never);
    render(<GradebookSheet classId="class-1" subjectId="subject-1" canManage={true} />);

    fireEvent.click(screen.getByRole("button", { name: "edit-report-score" }));
    expect(screen.getByTestId("manual-score-dialog")).toHaveTextContent(
      JSON.stringify({ current: 75.5, average: 86.14 }),
    );
  });
});
