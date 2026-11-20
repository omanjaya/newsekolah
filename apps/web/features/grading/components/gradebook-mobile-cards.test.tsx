import { render, screen } from "@testing-library/react";
import type { useTranslations } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import type { AssessmentComponent, GradebookStudent } from "../api";

import { GradebookMobileCards, type GradebookMobileCardsProps } from "./gradebook-mobile-cards";

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

const student: GradebookStudent = { student_user_id: "s1", name: "Budi", scores: { c1: 72.5 } };

function renderCards(overrides: Partial<GradebookMobileCardsProps> = {}) {
  const props: GradebookMobileCardsProps = {
    t,
    components: [component],
    students: [student],
    canManage: true,
    edits: {},
    cellValue: (componentId, s) => String(s.scores[componentId] ?? ""),
    starBalances: new Map([["s1", 2]]),
    scaleMin: 0,
    scaleMax: 100,
    scaleDecimals: 2,
    rangeHint: "",
    formatHint: "",
    liveByStudent: new Map(),
    pendingStudentIds: new Set(),
    onManualOverride: vi.fn(),
    onGiveStar: vi.fn(),
    onCommit: vi.fn(),
    onRegisterRef: vi.fn(),
    ...overrides,
  };
  return render(<GradebookMobileCards {...props} />);
}

describe("GradebookMobileCards", () => {
  it("gives a manager a score input and a star button", () => {
    renderCards();
    expect(screen.getByRole("textbox", { name: /scoreFor/ })).toHaveValue("72.5");
    expect(screen.getByRole("button", { name: 'starsFor:{"name":"Budi"}' })).toBeEnabled();
  });

  it("names a manager's report score button by its visible text, then the student", () => {
    renderCards({ canManage: true });
    expect(
      screen.getByRole("button", { name: 'reportScoreOfCard:{"name":"Budi","score":"-"}' }),
    ).toHaveTextContent("reportScoreColumn -");
  });

  it("names a manager's set report score for the student and its value, pending as a description", () => {
    renderCards({
      students: [{ ...student, report_score: 75.5 }],
      pendingStudentIds: new Set(["s1"]),
    });
    const button = screen.getByRole("button", {
      name: 'reportScoreOfCard:{"name":"Budi","score":"75,5"}',
    });
    expect(button).toHaveAccessibleDescription("reportScorePending");
  });

  it("gives a reader the score and star balance as text, with no disabled controls", () => {
    renderCards({ canManage: false });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("72,5")).toBeInTheDocument();
    expect(screen.getByText('starsBalance:{"name":"Budi","balance":"2"}')).toBeInTheDocument();
  });

  // An empty report score read as a value, full contrast and bold, beside
  // the muted empty average (audit r6-n16).
  it("mutes a reader's empty report score like the empty average", () => {
    const { rerender } = renderCards({ canManage: false });
    const empty = screen.getByText("reportScoreColumn -");
    expect(empty).toHaveClass("text-fg-muted");
    expect(empty).not.toHaveClass("text-fg", "text-label");
    expect(screen.getByText("averageColumn -")).toHaveClass("text-fg-muted");

    rerender(
      <GradebookMobileCards
        t={t}
        components={[component]}
        students={[{ ...student, report_score: 80 }]}
        canManage={false}
        edits={{}}
        cellValue={() => ""}
        starBalances={new Map()}
        scaleMin={0}
        scaleMax={100}
        scaleDecimals={2}
        rangeHint=""
        formatHint=""
        liveByStudent={new Map()}
        pendingStudentIds={new Set()}
        onManualOverride={vi.fn()}
        onGiveStar={vi.fn()}
        onCommit={vi.fn()}
        onRegisterRef={vi.fn()}
      />,
    );
    expect(screen.getByText(/^reportScoreColumn 80/)).toHaveClass("text-label", "text-fg");
  });
});
