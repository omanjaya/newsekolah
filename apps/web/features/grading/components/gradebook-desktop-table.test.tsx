import { render, screen } from "@testing-library/react";
import type { useTranslations } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import type { AssessmentComponent, GradebookStudent } from "../api";

import { GradebookDesktopTable, type GradebookDesktopTableProps } from "./gradebook-desktop-table";

vi.mock("next-intl", () => ({ useLocale: () => "id" }));

const t = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key) as unknown as ReturnType<
  typeof useTranslations
>;

const component: AssessmentComponent = {
  id: "c1",
  class_id: "class-1",
  subject_id: "subject-1",
  term_id: "term-1",
  code: "TG1",
  kind: "formative",
  weight: 1,
  sequence: 1,
};

const scored: GradebookStudent = {
  student_user_id: "s1",
  name: "Budi",
  scores: { c1: 88 },
  report_score: 88,
};
const empty: GradebookStudent = { student_user_id: "s2", name: "Citra", scores: {} };

function renderTable(overrides: Partial<GradebookDesktopTableProps> = {}) {
  const props: GradebookDesktopTableProps = {
    t,
    components: [component],
    students: [scored, empty],
    canManage: true,
    edits: {},
    cellValue: (componentId, student) => String(student.scores[componentId] ?? ""),
    savingComponentId: null,
    starBalances: new Map(),
    scaleMin: 0,
    scaleMax: 100,
    rangeHint: "",
    liveByStudent: new Map(),
    missingByComponent: new Map([["c1", 1]]),
    invalidComponentIds: new Set(),
    pendingStudentIds: new Set(),
    onEditComponent: vi.fn(),
    onManualOverride: vi.fn(),
    onGiveStar: vi.fn(),
    onSaveColumn: vi.fn(),
    onCommit: vi.fn(),
    onRegisterRef: vi.fn(),
    onNavigate: vi.fn(),
    onPasteBlock: vi.fn(),
    ...overrides,
  };
  return render(<GradebookDesktopTable {...props} />);
}

describe("GradebookDesktopTable", () => {
  it("says in words how many scores a column lacks, beside its weight", () => {
    renderTable();
    expect(screen.getByText('weightLabel:{"weight":1}')).toBeInTheDocument();
    expect(screen.getByText(/missingCount:\{"count":1\}/)).toBeVisible();
  });

  it("shows an empty report score as a muted dash a manager can still set", () => {
    renderTable();
    const set = screen.getByRole("button", { name: 'reportScoreSet:{"name":"Citra"}' });
    expect(set).toHaveTextContent("-");
    expect(set).toHaveClass("text-fg-muted");
    expect(set).not.toHaveClass("underline");
  });

  it("shows an empty report score as plain text to a reader", () => {
    renderTable({ canManage: false });
    expect(screen.queryByRole("button", { name: /reportScoreSet/ })).not.toBeInTheDocument();
  });
});
