import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ assign: vi.fn(), push: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("../../../lib/session/session-provider", () => ({
  useCan: () => true,
  useSession: () => ({ me: undefined }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
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

    // Submit stays enabled and says why it will not add them.
    await user.click(screen.getByRole("button", { name: "addConfirm" }));
    expect(screen.getByText("alreadyMember")).toBeInTheDocument();
    expect(mocks.assign).not.toHaveBeenCalled();
  });
});

describe("MentorGroupMembersPanel rows", () => {
  it("opens the mentor's view of a member from the row", async () => {
    const user = userEvent.setup();
    render(<MentorGroupMembersPanel groupId="group-1" />);

    // The phone card's tap target, named after the member.
    await user.click(screen.getByRole("button", { name: "Sari" }));
    expect(mocks.push).toHaveBeenCalledWith("/mentoring/groups/group-1/students/picked-1");
  });

  it("keeps the add action in the table toolbar and removal in the row menu", async () => {
    const user = userEvent.setup();
    render(<MentorGroupMembersPanel groupId="group-1" />);

    // One add action: the toolbar's, not a second one in a row of its own.
    expect(screen.getAllByRole("button", { name: "add" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "remove" })).not.toBeInTheDocument();

    const [menu] = screen.getAllByRole("button", { name: 'actionsFor {"name":"Sari"}' });
    await user.click(menu ?? document.body);
    expect(await screen.findByRole("menuitem", { name: "remove" })).toBeInTheDocument();
  });
});
