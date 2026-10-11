import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
  useGradeLevelsQuery: () => ({ data: { data: [{ id: "grade-1", name: "X" }] } }),
  useCreateClassMutation: () => ({ mutateAsync: mocks.create, isPending: false }),
  useUpdateClassMutation: () => ({ mutateAsync: mocks.update, isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import type { ClassRow } from "../api";

import { ClassForm } from "./class-form";

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

describe("ClassForm homeroom picker", () => {
  it("searches teachers and sends the picked one as homeroom teacher", async () => {
    const user = userEvent.setup();
    render(
      <ClassForm
        yearId="year-1"
        initial={{ id: "class-1", name: "X-A", grade_level_id: "grade-1" } as unknown as ClassRow}
        onDone={vi.fn()}
      />,
    );

    const picker = screen.getByRole("combobox", { name: "pick" });
    expect(picker).toHaveAttribute("data-kind", "teacher");
    await user.click(picker);
    await user.click(screen.getByRole("button", { name: "save" }));

    expect(mocks.update).toHaveBeenCalledWith({
      id: "class-1",
      body: {
        academic_year_id: "year-1",
        grade_level_id: "grade-1",
        name: "X-A",
        homeroom_teacher_id: "picked-1",
      },
    });
  });

  it("shows the existing homeroom teacher as the preset value when editing", () => {
    render(
      <ClassForm
        yearId="year-1"
        initial={
          {
            id: "class-1",
            name: "X-A",
            grade_level_id: "grade-1",
            homeroom_teacher_id: "teacher-9",
          } as unknown as ClassRow
        }
        onDone={vi.fn()}
      />,
    );

    expect(
      screen.getAllByRole("combobox").some((el) => el.getAttribute("data-value") === "teacher-9"),
    ).toBe(true);
  });
});
