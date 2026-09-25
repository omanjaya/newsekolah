import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
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
  GradebookSheet: ({ canManage }: { canManage: boolean }) => (
    <div data-testid="gradebook-sheet" data-can-manage={String(canManage)} />
  ),
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
