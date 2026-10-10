import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ assign: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../../lib/session/session-provider", () => ({ useCan: () => true }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../students/components/student-link", () => ({
  StudentLink: ({ children }: { children: string }) => <span>{children}</span>,
}));
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});
vi.mock("../../reference/directory-names", async () => {
  const { directoryNamesStub } = await import("../../../test/directory-names-stub");
  return directoryNamesStub([{ id: "picked-1", name: "Sari" }]);
});
vi.mock("../api", () => ({
  useMentorGroupMembersQuery: () => ({
    data: { data: [{ id: "m1", student_user_id: "picked-1" }] },
    isLoading: false,
  }),
  useGroupSizeLimitQuery: () => ({ data: { limit: 30 } }),
  useAssignMentorGroupMemberMutation: () => ({ mutate: mocks.assign, isPending: false }),
  useRemoveMentorGroupMemberMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { MentorGroupMembersPanel } from "./mentor-group-members-panel";

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
});

describe("MentorGroupMembersPanel add picker", () => {
  it("names current members from the batched lookup and searches students to add", async () => {
    const user = userEvent.setup();
    render(<MentorGroupMembersPanel groupId="group-1" />);

    expect(screen.getAllByText("Sari").length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole("button", { name: "add" }).at(0) ?? document.body);
    const picker = screen.getByRole("combobox", { name: "addPlaceholder" });
    expect(picker).toHaveAttribute("data-kind", "student");
  });

  it("will not add a student who is already in the group", async () => {
    const user = userEvent.setup();
    render(<MentorGroupMembersPanel groupId="group-1" />);

    await user.click(screen.getAllByRole("button", { name: "add" }).at(0) ?? document.body);
    await user.click(screen.getByRole("combobox", { name: "addPlaceholder" }));

    expect(screen.getByRole("button", { name: "addConfirm" })).toBeDisabled();
    expect(mocks.assign).not.toHaveBeenCalled();
  });
});
