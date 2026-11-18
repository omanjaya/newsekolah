import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/hooks/use-active-year", () => ({ useActiveYear: () => ({ id: "year-1" }) }));
vi.mock("../../academic/api-offerings", () => ({
  // A teacher (canOpenAny=false) is scoped to their own assignments; a
  // school-wide reader (canOpenAny=true, via view_reports or
  // manage_master_data) ignores this query entirely (grading-view.tsx
  // passes empty args), so this fixture only has to cover the teacher
  // case -- one active assignment for class-1/subject-1, matching the
  // fixed classes/subjects mocked below.
  useTeachingAssignmentsForTeacherQuery: () => ({
    data: { data: [{ class_id: "class-1", subject_id: "subject-1", is_active: true }] },
    isLoading: false,
  }),
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({
    data: { data: [{ id: "class-1", name: "X-A" }] },
    isLoading: false,
  }),
  useSubjectsQuery: () => ({
    data: { data: [{ id: "subject-1", name: "Matematika" }] },
    isLoading: false,
  }),
}));
vi.mock("./erapor-export", () => ({ EraporExport: () => <div data-testid="erapor-export" /> }));
vi.mock("./grading-settings", () => ({
  GradingSettings: () => <div data-testid="grading-settings" />,
}));
vi.mock("./tp-mapping-editor", () => ({
  TPMappingEditor: () => <div data-testid="tp-mapping-editor" />,
}));
vi.mock("./gradebook-sheet", () => ({
  GradebookSheet: ({
    canManage,
    onPendingChangesChange,
  }: {
    canManage: boolean;
    onPendingChangesChange: (count: number) => void;
  }) => (
    <div data-testid="gradebook-sheet" data-can-manage={String(canManage)}>
      <button
        type="button"
        onClick={() => {
          onPendingChangesChange(3);
        }}
      >
        make-dirty
      </button>
    </div>
  ),
}));
vi.mock("../api", () => ({
  useTermsQuery: () => ({ data: { data: [] }, isLoading: false }),
}));

const canFn = vi.hoisted(() => vi.fn<(permission: string) => boolean>());
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: (permission: string): boolean => canFn(permission),
  useSession: () => ({ me: { id: "user-1" } }),
}));

import { GradingView } from "./grading-view";

afterEach(() => {
  cleanup();
  canFn.mockReset();
  // The tab lives in the address; start every test on the default panel.
  window.history.replaceState(null, "", "/");
});

/** Permission holder: view_grades + view_reports only, exactly a principal
 * (Kepala Sekolah) reading the whole school's grades without manage_grades
 * or manage_master_data (role_defaults.go's principal entry). */
function grantViewGradesOnly() {
  canFn.mockImplementation(
    (permission: string) => permission === "view_grades" || permission === "view_reports",
  );
}

/** Permission holder: manage_grades (a plain teacher, role_defaults.go's
 * teacher entry, which also carries view_grades alongside it). */
function grantManageGrades() {
  canFn.mockImplementation(
    (permission: string) => permission === "manage_grades" || permission === "view_grades",
  );
}

describe("GradingView read-only rendering for view_grades", () => {
  it("renders the gradebook read-only (GradebookSheet's canManage=false) for a view_grades-only reader", () => {
    grantViewGradesOnly();
    render(<GradingView />);

    const sheet = screen.getByTestId("gradebook-sheet");
    expect(sheet).toHaveAttribute("data-can-manage", "false");
  });

  it("shows the e-Rapor tab (a read surface) but hides the TP mapping and settings tabs for a view_grades-only reader", () => {
    grantViewGradesOnly();
    render(<GradingView />);

    expect(screen.getByRole("tab", { name: "tabGradebook" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "tabErapor" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "tabTpMapping" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "tabSettings" })).not.toBeInTheDocument();
  });

  it("still renders full edit access (canManage=true, every tab) for a manage_grades teacher", () => {
    grantManageGrades();
    render(<GradingView />);

    expect(screen.getByTestId("gradebook-sheet")).toHaveAttribute("data-can-manage", "true");
    expect(screen.getByRole("tab", { name: "tabTpMapping" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "tabErapor" })).toBeInTheDocument();
  });

  it("opens the sheet first, scoped by one picker of the teacher's own assignments", () => {
    grantManageGrades();
    render(<GradingView />);

    expect(screen.getByRole("combobox", { name: "pickAssignment" })).toHaveTextContent(
      "X-A · Matematika",
    );
    expect(screen.queryByRole("combobox", { name: "pickClass" })).not.toBeInTheDocument();
    expect(screen.getByTestId("gradebook-sheet")).toBeInTheDocument();
  });

  it("gives a school-wide reader separate class and subject pickers", () => {
    grantViewGradesOnly();
    render(<GradingView />);

    expect(screen.getByRole("combobox", { name: "pickClass" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "pickSubject" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "pickAssignment" })).not.toBeInTheDocument();
    // On a phone the subject, the longest name, takes a row of its own
    // under the class and the term instead of being cut beside the class.
    expect(
      screen.getByRole("combobox", { name: "pickSubject" }).closest(".col-span-2"),
    ).toHaveClass("max-sm:order-last", "sm:col-span-1");
  });

  it("hides the class and subject pickers on the e-Rapor panel, which has its own scope", async () => {
    grantManageGrades();
    const user = userEvent.setup();
    render(<GradingView />);

    await user.click(screen.getByRole("tab", { name: "tabErapor" }));
    expect(screen.getByRole("tabpanel")).toContainElement(screen.getByTestId("erapor-export"));
    expect(screen.queryByRole("combobox", { name: "pickAssignment" })).not.toBeInTheDocument();
  });

  it("shows no tab bar at all for a reader with neither manage_grades nor view_grades", () => {
    canFn.mockReturnValue(false);
    render(<GradingView />);

    expect(screen.queryByRole("tab", { name: "tabGradebook" })).not.toBeInTheDocument();
    // GradingView itself never gates the sheet on view_grades/manage_grades
    // -- components/app-shell.tsx's canOpenPath already keeps a reader
    // with neither permission off this route entirely (lib/navigation.ts's
    // grading entry: anyPermission: ["manage_grades", "view_grades"]), and
    // the server is the real data gate (openapi/modules/grading.yaml's
    // view_grades on GetGradebook). This assertion only documents that
    // GradingView's own rendering degrades safely (read-only) rather than
    // crashing if it were ever reached.
    expect(screen.getByTestId("gradebook-sheet")).toHaveAttribute("data-can-manage", "false");
  });
});

describe("GradingView unsaved changes", () => {
  it("asks through the shared confirm dialog, not window.confirm, before leaving a dirty sheet", async () => {
    grantManageGrades();
    const nativeConfirm = vi.spyOn(window, "confirm");
    const user = userEvent.setup();
    render(<GradingView />);

    await user.click(screen.getByRole("button", { name: "make-dirty" }));
    await user.click(screen.getByRole("tab", { name: "tabErapor" }));

    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "table.discardChangesTitle" })).toBeInTheDocument();
    expect(screen.queryByTestId("erapor-export")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "table.discardChangesConfirm" }));
    expect(screen.getByTestId("erapor-export")).toBeInTheDocument();
  });

  it("switches tabs straight away when nothing is unsaved", async () => {
    grantManageGrades();
    const user = userEvent.setup();
    render(<GradingView />);

    await user.click(screen.getByRole("tab", { name: "tabErapor" }));
    expect(screen.getByTestId("erapor-export")).toBeInTheDocument();
  });
});
