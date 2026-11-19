import type * as UiModule from "@newsekolah/ui";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  move: vi.fn(),
  leave: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  canManageEnrollments: true,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
  useFormatter: () => ({ dateTime: (date: Date) => date.toISOString().slice(0, 10) }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => mocks.canManageEnrollments,
  useSession: () => ({ me: { tenant: { timezone: "Asia/Makassar" } } }),
}));
vi.mock("../../attendance/api", () => ({ todayInZone: () => "2026-11-14" }));
vi.mock("../../reference/api", () => ({ useClassesQuery: () => ({ data: { data: [] } }) }));
vi.mock("../../reference/directory-names", () => ({ useDirectoryNames: () => new Map() }));
vi.mock("../../students/components/student-link", () => ({
  StudentLink: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../../academic/api-school-extras", () => ({
  useMoveStudentMutation: () => ({ mutateAsync: mocks.move }),
  useRemoveStudentMutation: () => ({ mutateAsync: mocks.leave }),
}));
vi.mock("../api", () => ({
  useEnrollmentsQuery: () => ({
    isLoading: false,
    isError: false,
    data: {
      data: [
        {
          id: "enr-1",
          student_user_id: "s-1",
          student_name: "Ani",
          student_nis: "1001",
          joined_on: "2026-07-13",
          status: "active",
        },
        {
          id: "enr-2",
          student_user_id: "s-2",
          student_name: "Budi",
          student_nis: "1002",
          joined_on: "2026-07-13",
          status: "active",
        },
        {
          id: "enr-3",
          student_user_id: "s-3",
          student_name: "Cici",
          joined_on: "2026-07-13",
          status: "left",
        },
      ],
    },
  }),
  useBulkAssignMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUnassignedStudentsQuery: () => ({ data: { data: [] }, isLoading: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: mocks.success, error: mocks.error }) };
});

import { EnrollmentPanel } from "./class-panels";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {
        return undefined;
      }
      unobserve() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    },
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.canManageEnrollments = true;
  mocks.move.mockResolvedValue({});
  mocks.leave.mockResolvedValue({});
});

describe("EnrollmentPanel roster", () => {
  it("lists the active students only, numbered, with their NIS", () => {
    render(<EnrollmentPanel classId="class-1" canManage />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Ani")).toBeInTheDocument();
    expect(within(table).getByText("1002")).toBeInTheDocument();
    expect(within(table).queryByText("Cici")).not.toBeInTheDocument();
  });

  // The phone card showed a bare date under the NIS; it now says what the
  // date is. The table keeps the date alone under its column header.
  it("labels the joined date on the phone card only, on the enrolment day itself", () => {
    const { container } = render(<EnrollmentPanel classId="class-1" canManage />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("2026-07-13").length).toBeGreaterThan(0);
    const cards = container.querySelector(".md\\:hidden ul");
    expect(cards).not.toBeNull();
    expect(
      within(cards as HTMLElement).getAllByText('cardJoined {"date":"2026-07-13"}').length,
    ).toBeGreaterThan(0);
  });

  it("marks every ticked student as left in one go and reports the count", async () => {
    const user = userEvent.setup();
    render(<EnrollmentPanel classId="class-1" canManage />);
    const table = screen.getByRole("table");
    const [selectAll] = within(table).getAllByRole("checkbox");
    if (!selectAll) throw new Error("no select-all checkbox");
    await user.click(selectAll);
    await user.click(screen.getByRole("button", { name: "leaveSelected" }));

    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "leaveSubmit" }));

    expect(mocks.leave).toHaveBeenCalledTimes(2);
    expect(mocks.leave).toHaveBeenCalledWith({
      enrollmentId: "enr-1",
      body: { left_on: "2026-11-14" },
    });
    expect(mocks.leave).toHaveBeenCalledWith({
      enrollmentId: "enr-2",
      body: { left_on: "2026-11-14" },
    });
    expect(mocks.success).toHaveBeenCalledWith('leftCount {"n":2}');
  });

  it("keeps the remaining changes going when one fails and shows the first error", async () => {
    const user = userEvent.setup();
    mocks.leave.mockRejectedValueOnce(new Error("boom"));
    render(<EnrollmentPanel classId="class-1" canManage />);
    const [selectAll] = within(screen.getByRole("table")).getAllByRole("checkbox");
    if (!selectAll) throw new Error("no select-all checkbox");
    await user.click(selectAll);
    await user.click(screen.getByRole("button", { name: "leaveSelected" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "leaveSubmit" }),
    );

    expect(mocks.leave).toHaveBeenCalledTimes(2);
    expect(mocks.error).toHaveBeenCalledWith("UNKNOWN");
    expect(mocks.success).toHaveBeenCalledWith('leftCount {"n":1}');
  });

  it("offers no selection or row menu without the enrollment permission", () => {
    mocks.canManageEnrollments = false;
    render(<EnrollmentPanel classId="class-1" canManage />);
    expect(within(screen.getByRole("table")).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /rowActionsMenu/ })).not.toBeInTheDocument();
  });
});
