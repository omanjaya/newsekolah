import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/hooks/use-active-year", () => ({
  useActiveYear: () => ({ id: "year-1", label: "2025/2026" }),
}));
vi.mock("../../reference/api", () => ({
  useLookup: (items: { id: string }[] | undefined) =>
    new Map((items ?? []).map((item) => [item.id, item])),
  useSubjectsQuery: () => ({ data: { data: [{ id: "subject-1", name: "Matematika" }] } }),
  useTeachersQuery: () => ({ data: { data: [{ id: "teacher-1", name: "Budi" }] } }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: mocks.toastSuccess, error: mocks.toastError }) };
});

let assignments: { id: string; teacher_user_id: string; subject_id: string; is_active: boolean }[];

vi.mock("../api", () => ({
  useTeachingAssignmentsQuery: () => ({
    data: { data: assignments },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCreateTeachingAssignmentMutation: () => ({ mutate: mocks.create, isPending: false }),
  useDeleteTeachingAssignmentMutation: () => ({ mutate: mocks.remove, isPending: false }),
  useUpdateTeachingAssignmentMutation: () => ({
    mutate: mocks.update,
    isPending: false,
    variables: undefined,
  }),
}));

import { TeachingPanel } from "./teaching-panel";

describe("TeachingPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assignments = [
      { id: "assign-1", teacher_user_id: "teacher-1", subject_id: "subject-1", is_active: true },
      { id: "assign-2", teacher_user_id: "teacher-1", subject_id: "subject-1", is_active: false },
    ];
  });

  it("deactivates an active assignment instead of deleting it", async () => {
    const user = userEvent.setup();
    render(<TeachingPanel classId="class-1" canManage />);

    await user.click(screen.getByRole("button", { name: "deactivateTeaching" }));

    expect(mocks.update).toHaveBeenCalledWith(
      { id: "assign-1", isActive: false },
      expect.any(Object),
    );
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("reveals inactive assignments and reactivates one", async () => {
    const user = userEvent.setup();
    render(<TeachingPanel classId="class-1" canManage />);

    await user.click(screen.getByRole("button", { name: "showInactiveTeaching" }));
    await user.click(screen.getByRole("button", { name: "reactivateTeaching" }));

    expect(mocks.update).toHaveBeenCalledWith(
      { id: "assign-2", isActive: true },
      expect.any(Object),
    );
  });

  it("hides deactivate/reactivate actions without manage permission", () => {
    render(<TeachingPanel classId="class-1" canManage={false} />);

    expect(screen.queryByRole("button", { name: "deactivateTeaching" })).not.toBeInTheDocument();
  });
});
