import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
// useUrlState reads the tab from the router's query, which Next keeps in
// step with the history writes it makes; the stub follows the address the
// same way, so a tab click lands on its panel.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/hooks/use-active-year", () => ({ useActiveYear: () => ({ id: "year-1" }) }));
// The actor's own teaching assignments. A teacher (canOpenAny=false) is
// scoped to them; a school-wide reader who also holds manage_grades (a
// counselor) loads them to know which sheets it may edit; a reader
// without manage_grades skips the query (grading-view.tsx passes empty
// args, which disables it -- the stub returns nothing then, like the
// real disabled query).
const assignmentsFixture = vi.hoisted(() => ({
  current: [{ class_id: "class-1", subject_id: "subject-1", is_active: true }],
}));
vi.mock("../../academic/api-offerings", () => ({
  useTeachingAssignmentsForTeacherQuery: (yearId: string, teacherId: string) =>
    yearId && teacherId
      ? { data: { data: assignmentsFixture.current }, isLoading: false }
      : { data: undefined, isLoading: false },
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({
    data: {
      data: [
        { id: "class-1", name: "X-A" },
        { id: "class-2", name: "X-B" },
      ],
    },
    isLoading: false,
  }),
  useSubjectsQuery: () => ({
    data: {
      data: [
        { id: "subject-1", name: "Matematika" },
        { id: "subject-2", name: "Biologi" },
      ],
    },
    isLoading: false,
  }),
}));
vi.mock("./erapor-export", () => ({
  EraporExport: ({
    canPublish,
    onOpenGradebook,
  }: {
    canPublish: boolean;
    onOpenGradebook: () => void;
  }) => (
    <div data-testid="erapor-export" data-can-publish={String(canPublish)}>
      <button type="button" onClick={onOpenGradebook}>
        open-gradebook
      </button>
    </div>
  ),
}));
vi.mock("./grading-settings", () => ({
  GradingSettings: () => <div data-testid="grading-settings" />,
}));
vi.mock("./tp-mapping-editor", () => ({
  TPMappingEditor: ({ termId }: { termId?: string }) => (
    <div data-testid="tp-mapping-editor" data-term-id={termId ?? ""} />
  ),
}));
vi.mock("./gradebook-sheet", () => ({
  GradebookSheet: ({
    classId,
    subjectId,
    canManage,
    onPendingChangesChange,
  }: {
    classId: string;
    subjectId: string;
    canManage: boolean;
    onPendingChangesChange: (count: number) => void;
  }) => (
    <div
      data-testid="gradebook-sheet"
      data-class-id={classId}
      data-subject-id={subjectId}
      data-can-manage={String(canManage)}
    >
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
  useTermsQuery: () => ({
    data: { data: [{ id: "term-2", name: "Semester 2" }] },
    isLoading: false,
  }),
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
  assignmentsFixture.current = [{ class_id: "class-1", subject_id: "subject-1", is_active: true }];
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

/** Permission holder: manage_grades plus the school-wide view_reports read,
 * without manage_master_data -- a counselor (Guru BK) who reads every
 * sheet but may only write the ones they teach. */
function grantCounselor() {
  canFn.mockImplementation(
    (permission: string) =>
      permission === "manage_grades" ||
      permission === "view_grades" ||
      permission === "view_reports",
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

describe("GradingView edit scope for a school-wide reader who also teaches", () => {
  it("starts on a sheet the counselor teaches, editable there", () => {
    grantCounselor();
    assignmentsFixture.current = [
      { class_id: "class-2", subject_id: "subject-2", is_active: true },
    ];
    render(<GradingView />);

    const sheet = screen.getByTestId("gradebook-sheet");
    expect(sheet).toHaveAttribute("data-class-id", "class-2");
    expect(sheet).toHaveAttribute("data-subject-id", "subject-2");
    expect(sheet).toHaveAttribute("data-can-manage", "true");
  });

  it("shows any other class's sheet read-only, like a principal's", () => {
    grantCounselor();
    assignmentsFixture.current = [
      { class_id: "class-2", subject_id: "subject-2", is_active: true },
    ];
    window.history.replaceState(null, "", "/?class=class-1&subject=subject-1");
    render(<GradingView />);

    const sheet = screen.getByTestId("gradebook-sheet");
    expect(sheet).toHaveAttribute("data-class-id", "class-1");
    expect(sheet).toHaveAttribute("data-can-manage", "false");
  });

  it("explains on the TP tab that an untaught sheet's TP belongs to its teacher", () => {
    grantCounselor();
    assignmentsFixture.current = [
      { class_id: "class-2", subject_id: "subject-2", is_active: true },
    ];
    window.history.replaceState(null, "", "/?tab=tp&class=class-1&subject=subject-1");
    render(<GradingView />);

    expect(screen.getByText("tpReadOnlyTitle")).toBeInTheDocument();
    expect(screen.queryByTestId("tp-mapping-editor")).not.toBeInTheDocument();
  });

  it("keeps the TP editor on a sheet the counselor teaches", () => {
    grantCounselor();
    assignmentsFixture.current = [
      { class_id: "class-2", subject_id: "subject-2", is_active: true },
    ];
    window.history.replaceState(null, "", "/?tab=tp");
    render(<GradingView />);

    expect(screen.getByTestId("tp-mapping-editor")).toBeInTheDocument();
  });

  it("keeps every sheet editable for manage_master_data, which the server lets write anywhere", () => {
    canFn.mockImplementation(
      (permission: string) => permission === "manage_grades" || permission === "manage_master_data",
    );
    window.history.replaceState(null, "", "/?class=class-2&subject=subject-2");
    render(<GradingView />);

    expect(screen.getByTestId("gradebook-sheet")).toHaveAttribute("data-can-manage", "true");
  });
});

describe("GradingView TP and e-Rapor panels", () => {
  it("drives the TP mapping by the header's term picker, not a second picker", () => {
    grantManageGrades();
    window.history.replaceState(null, "", "/?tab=tp&term=term-2");
    render(<GradingView />);

    expect(screen.getByTestId("tp-mapping-editor")).toHaveAttribute("data-term-id", "term-2");
  });

  it("tells the e-Rapor panel whether the viewer can publish, and lets it open the gradebook", async () => {
    grantManageGrades();
    window.history.replaceState(null, "", "/?tab=erapor");
    const user = userEvent.setup();
    render(<GradingView />);

    expect(screen.getByTestId("erapor-export")).toHaveAttribute("data-can-publish", "true");
    await user.click(screen.getByRole("button", { name: "open-gradebook" }));
    expect(screen.getByTestId("gradebook-sheet")).toBeVisible();
  });

  it("marks a view_grades-only reader on the e-Rapor panel as unable to publish", () => {
    grantViewGradesOnly();
    window.history.replaceState(null, "", "/?tab=erapor");
    render(<GradingView />);

    expect(screen.getByTestId("erapor-export")).toHaveAttribute("data-can-publish", "false");
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
