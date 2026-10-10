import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});
vi.mock("../api-counseling-extras", () => ({
  useCreateCounselingMutation: () => ({ mutate: mocks.create, isPending: false }),
  useUpdateCounselingMutation: () => ({ mutate: mocks.update, isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { CounselingForm } from "./counseling-form";

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
  window.localStorage.clear();
});

describe("CounselingForm student picker", () => {
  it("searches students and records the session for the one picked", async () => {
    const user = userEvent.setup();
    render(<CounselingForm onDone={vi.fn()} />);

    const picker = screen.getByRole("combobox", { name: "studentPlaceholder" });
    expect(picker).toHaveAttribute("data-kind", "student");
    await user.click(picker);
    await user.type(screen.getByRole("textbox", { name: "title" }), "Konseling");
    await user.type(screen.getByRole("textbox", { name: "content" }), "Isi sesi");
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ student_user_id: "picked-1", title: "Konseling" }),
      expect.any(Object),
    );
  });

  it("opens a deep-linked student and locks the picker when editing", () => {
    const { unmount } = render(<CounselingForm initialStudentId="student-3" onDone={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "studentPlaceholder" })).toHaveAttribute(
      "data-value",
      "student-3",
    );

    unmount();
    render(
      <CounselingForm
        initial={
          {
            id: "note-1",
            student_user_id: "student-8",
            title: "T",
            content: "C",
            kind: "individual",
            topic: "problem",
            visibility: "counselor",
            session_at: "2026-10-01T03:00:00Z",
          } as never
        }
        onDone={vi.fn()}
      />,
    );
    const locked = screen.getByRole("combobox", { name: "studentPlaceholder" });
    expect(locked).toHaveAttribute("data-value", "student-8");
    expect(locked).toBeDisabled();
  });
});
