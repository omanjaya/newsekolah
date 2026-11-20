import { fireEvent, render, screen, within } from "@testing-library/react";
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
    scaleDecimals: 2,
    rangeHint: "",
    formatHint: "",
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

  it("offers an empty report score to a manager as a pencil button, not a bare dash", () => {
    const onManualOverride = vi.fn();
    renderTable({ onManualOverride });
    const button = screen.getByRole("button", { name: 'reportScoreSet:{"name":"Citra"}' });
    expect(button).not.toHaveTextContent("-");
    expect(button.querySelector("svg")).not.toBeNull();
    // A real hit area (IconButton sm is 32px), not a 6px link around "-".
    expect(button).toHaveClass("size-8");
    fireEvent.click(button);
    expect(onManualOverride).toHaveBeenCalledWith(empty);
  });

  it("keeps an existing report score as an underlined value a manager can change", () => {
    const onManualOverride = vi.fn();
    renderTable({ onManualOverride });
    // Named for the student (grades-discipline-R2), not by the bare score.
    const button = screen.getByRole("button", {
      name: /^reportScoreOf:\{"name":"Budi","score":"88/,
    });
    expect(button).toHaveClass("underline");
    fireEvent.click(button);
    expect(onManualOverride).toHaveBeenCalledWith(scored);
  });

  it("shows a dash, not a false zero, while the star balances are unknown", () => {
    renderTable({ starBalances: null });
    expect(screen.getByRole("button", { name: 'starsFor:{"name":"Budi"}' })).toHaveTextContent("-");
  });

  it("shows each student's star balance once loaded", () => {
    renderTable({ starBalances: new Map([["s1", 4]]) });
    expect(screen.getByRole("button", { name: 'starsFor:{"name":"Budi"}' })).toHaveTextContent("4");
    expect(screen.getByRole("button", { name: 'starsFor:{"name":"Citra"}' })).toHaveTextContent(
      "0",
    );
  });

  it("shows an empty report score as plain text to a reader", () => {
    renderTable({ canManage: false });
    expect(screen.queryByRole("button", { name: /reportScoreSet/ })).not.toBeInTheDocument();
  });

  it("shows a reader the scores as plain text, not inputs that only look editable", () => {
    renderTable({ canManage: false });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    const budi = screen.getByRole("row", { name: /Budi/ });
    const citra = screen.getByRole("row", { name: /Citra/ });
    // In the reader's locale, like the average beside it; a missing score
    // is the same muted dash as every other empty cell.
    expect(within(budi).getAllByText("88,0")[0]).toHaveClass("text-fg", "block");
    expect(within(citra).getAllByText("-")[0]).toHaveClass("text-fg-muted");
  });

  it("shows a reader's score cells with the scale's decimals, like the average beside them", () => {
    renderTable({
      canManage: false,
      scaleDecimals: 0,
      liveByStudent: new Map([["s1", { average: 88, missing: 0 }]]),
    });
    const budiCells = within(screen.getByRole("row", { name: /Budi/ })).getAllByRole("cell");
    // Columns: TG1, Rata-rata, Nilai rapor, stars.
    expect(budiCells[0]).toHaveTextContent(/^88$/);
    expect(budiCells[1]).toHaveTextContent(/^88$/);
  });

  it("mutes an empty average like the empty score and report-score cells beside it", () => {
    renderTable({
      canManage: false,
      liveByStudent: new Map([
        ["s1", { average: 88, missing: 0 }],
        ["s2", { average: undefined, missing: 1 }],
      ]),
    });
    const budiCells = within(screen.getByRole("row", { name: /Budi/ })).getAllByRole("cell");
    const citraCells = within(screen.getByRole("row", { name: /Citra/ })).getAllByRole("cell");
    // Columns: TG1, Rata-rata, Nilai rapor, stars.
    expect(budiCells[1]).toHaveTextContent("88,0");
    expect(budiCells[1]).toHaveClass("text-fg");
    expect(citraCells[1]).toHaveTextContent("-");
    expect(citraCells[1]).toHaveClass("text-fg-muted");
    expect(citraCells[1]).not.toHaveClass("text-fg");
  });

  it("keeps editable score inputs for a manager", () => {
    renderTable();
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
  });

  it("shows a reader the star balance as text named as a balance, not a disabled action", () => {
    renderTable({ canManage: false, starBalances: new Map([["s1", 4]]) });
    expect(screen.queryByRole("button", { name: /starsFor/ })).not.toBeInTheDocument();
    expect(screen.getByText('starsBalance:{"name":"Budi","balance":"4"}')).toHaveClass("sr-only");
  });
});
