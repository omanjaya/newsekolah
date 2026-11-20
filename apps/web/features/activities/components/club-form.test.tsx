import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});
vi.mock("../api", () => ({
  useCreateExtracurricularMutation: () => ({ mutate: mocks.create, isPending: false }),
  useUpdateExtracurricularMutation: () => ({ mutate: mocks.update, isPending: false }),
}));

import { ClubForm } from "./club-form";

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

describe("ClubForm coach", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.update.mockReset();
  });

  it("assigns a teacher as the club's coach", async () => {
    // The form had no coach field: nobody could be made pembina.
    const user = userEvent.setup();
    render(<ClubForm onDone={vi.fn()} />);
    const picker = screen.getByRole("combobox", { name: "coachPlaceholder" });
    expect(picker).toHaveAttribute("data-kind", "teacher");

    await user.type(screen.getByRole("textbox", { name: /name/ }), "Pramuka");
    await user.click(picker);
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Pramuka", coach_user_id: "picked-1" }),
      expect.anything(),
    );
  });

  it("clears the coach of an existing club", async () => {
    const user = userEvent.setup();
    render(
      <ClubForm
        initial={{
          id: "club-1",
          academic_year_id: "year-1",
          name: "Pramuka",
          description: "",
          location: "",
          is_active: true,
          coach_user_id: "teacher-1",
        }}
        onDone={vi.fn()}
      />,
    );
    expect(screen.getByRole("combobox", { name: "coachPlaceholder" })).toHaveAttribute(
      "data-value",
      "teacher-1",
    );
    await user.click(screen.getByRole("button", { name: "coachClear" }));
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "club-1", coach_user_id: undefined }),
      expect.anything(),
    );
  });
});
