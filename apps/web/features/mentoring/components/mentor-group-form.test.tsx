import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});
vi.mock("../api", () => ({
  useCreateMentorGroupMutation: () => ({ mutate: mocks.create, isPending: false }),
  useUpdateMentorGroupMutation: () => ({ mutate: mocks.update, isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { MentorGroupForm } from "./mentor-group-form";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MentorGroupForm mentor picker", () => {
  it("creates a group for the teacher picked by search", async () => {
    const user = userEvent.setup();
    render(<MentorGroupForm onDone={vi.fn()} />);

    const picker = screen.getByRole("combobox", { name: "mentorPlaceholder" });
    expect(picker).toHaveAttribute("data-kind", "teacher");
    // Submit stays enabled: pressing it early explains what is missing.
    await user.click(screen.getByRole("button", { name: "submit" }));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(screen.getAllByText("required")).toHaveLength(2);
    // The first invalid control takes focus (the stub picker carries no field wiring).
    expect(screen.getByRole("textbox", { name: "name" })).toHaveFocus();
    await user.click(picker);
    await user.type(screen.getByRole("textbox", { name: "name" }), "Kelompok A");
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mocks.create).toHaveBeenCalledWith(
      { mentor_user_id: "picked-1", name: "Kelompok A" },
      expect.any(Object),
    );
  });

  it("starts an edit on the group's current mentor", () => {
    render(
      <MentorGroupForm
        initial={{ id: "group-1", name: "Kelompok B", mentor_user_id: "teacher-4" } as never}
        onDone={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox", { name: "mentorPlaceholder" })).toHaveAttribute(
      "data-value",
      "teacher-4",
    );
  });
});
