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
    rangeHint: "",
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
    expect(screen.getByRole("spinbutton", { name: /scoreFor/ })).toHaveValue(72.5);
    expect(screen.getByRole("button", { name: 'starsFor:{"name":"Budi"}' })).toBeEnabled();
  });

  it("gives a reader the score and star balance as text, with no disabled controls", () => {
    renderCards({ canManage: false });
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("72,5")).toBeInTheDocument();
    expect(screen.getByText('starsBalance:{"name":"Budi","balance":"2"}')).toBeInTheDocument();
  });
});
