import type * as UiModule from "@newsekolah/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Gradebook } from "../api";
import { loadGradebookDraft, saveGradebookDraft } from "../lib/gradebook-draft";

import { GradebookTable } from "./gradebook-table";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({
    me: { id: "teacher-1", tenant: { tenant_id: "tenant-1", timezone: "Asia/Makassar" } },
  }),
}));
vi.mock("../api", () => ({
  useSaveComponentScoresMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return {
    ...actual,
    useMediaQuery: () => true,
    useToast: () => ({ success: vi.fn(), error: vi.fn() }),
  };
});

const OWNER = "tenant-1:teacher-1";
const SHEET_KEY = "class-1:subject-1:term-1";

const sheet: Gradebook = {
  term_id: "term-1",
  term_name: "Semester 1",
  class_id: "class-1",
  subject_id: "subject-1",
  scale: {
    version: 1,
    min: 0,
    max: 100,
    report_increase_max: 0,
    default_kktp: 75,
    round_decimal: 2,
  },
  components: [
    {
      id: "c1",
      class_id: "class-1",
      subject_id: "subject-1",
      term_id: "term-1",
      code: "TG1",
      kind: "formative",
      weight: 1,
      sequence: 1,
    },
  ],
  students: [{ student_user_id: "s1", name: "Citra", scores: {} }],
  is_published: false,
};

function renderTable() {
  return render(
    <GradebookTable
      sheet={sheet}
      canManage
      search=""
      onSearchChange={vi.fn()}
      onEditComponent={vi.fn()}
      onManualOverride={vi.fn()}
      starBalances={new Map()}
      onGiveStar={vi.fn()}
      onAddComponent={vi.fn()}
    />,
  );
}

function scoreInput(): HTMLInputElement {
  const input = screen.getAllByRole("textbox").find((el) => el.id.includes("c1-s1"));
  if (!(input instanceof HTMLInputElement)) throw new Error("score cell not found");
  return input;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("GradebookTable draft", () => {
  it("removes the stored draft once a typed value is cleared again", () => {
    const { unmount } = renderTable();
    const input = scoreInput();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "65" } });
    fireEvent.blur(input);
    expect(loadGradebookDraft(OWNER, SHEET_KEY)?.edits).toEqual({ c1: { s1: "65" } });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(loadGradebookDraft(OWNER, SHEET_KEY)).toBeNull();

    unmount();
    renderTable();
    expect(screen.queryByText("draftFoundTitle")).not.toBeInTheDocument();
  });

  it("offers a stored draft on mount without clearing it", () => {
    saveGradebookDraft(OWNER, SHEET_KEY, { c1: { s1: "70" } });

    renderTable();

    expect(screen.getByText("draftFoundTitle")).toBeInTheDocument();
    expect(loadGradebookDraft(OWNER, SHEET_KEY)).not.toBeNull();
  });

  it("does not offer a stored draft whose columns hold no cells", () => {
    saveGradebookDraft(OWNER, SHEET_KEY, { c1: {} });

    renderTable();

    expect(screen.queryByText("draftFoundTitle")).not.toBeInTheDocument();
  });
});

describe("GradebookTable saved scores", () => {
  it("shows a saved decimal with the Indonesian comma, as the teacher typed it", () => {
    render(
      <GradebookTable
        sheet={{
          ...sheet,
          students: [{ student_user_id: "s1", name: "Citra", scores: { c1: 8.5 } }],
        }}
        canManage
        search=""
        onSearchChange={vi.fn()}
        onEditComponent={vi.fn()}
        onManualOverride={vi.fn()}
        starBalances={new Map()}
        onGiveStar={vi.fn()}
        onAddComponent={vi.fn()}
      />,
    );
    const input = scoreInput();
    expect(input).toHaveValue("8,5");

    // Tabbing through the untouched cell leaves nothing pending.
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(loadGradebookDraft(OWNER, SHEET_KEY)).toBeNull();
  });
});
