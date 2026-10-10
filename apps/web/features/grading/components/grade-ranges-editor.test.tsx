import type * as UiModule from "@newsekolah/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ ranges: vi.fn() }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { id: "me-1" } }),
}));
vi.mock("../../reference/components/directory-picker", async () => {
  const { directoryPickerStubModule } = await import("../../../test/directory-picker-stub");
  return directoryPickerStubModule;
});
vi.mock("../../reference/api", () => ({
  useSubjectsQuery: () => ({ data: { data: [{ id: "subject-1", name: "Matematika" }] } }),
}));
vi.mock("../api", () => ({
  useGradeRangesQuery: mocks.ranges,
  useReplaceGradeRangesMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { GradeRangesEditor } from "./grade-ranges-editor";

beforeAll(() => {
  // Radix Select probes pointer capture and scrolls the active option into view.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
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
  mocks.ranges.mockReturnValue({ data: { data: [] }, isLoading: false });
});

describe("GradeRangesEditor teacher scope", () => {
  it("offers no teacher picker to a teacher without settings access", () => {
    render(<GradeRangesEditor canManageSettings={false} />);

    expect(screen.queryByRole("combobox", { name: "rangeTeacherPlaceholder" })).toBeNull();
    expect(screen.getByText("rangeYourOwnHint")).toBeInTheDocument();
  });

  it("starts school-wide and shows no teacher picker until a specific teacher is chosen", () => {
    render(<GradeRangesEditor canManageSettings />);

    expect(screen.queryByRole("combobox", { name: "rangeTeacherPlaceholder" })).toBeNull();
    expect(mocks.ranges).toHaveBeenCalled();
  });

  it("searches teachers by name once a specific teacher scope is chosen", async () => {
    const user = userEvent.setup();
    render(<GradeRangesEditor canManageSettings />);

    await user.click(screen.getByRole("combobox", { name: "rangeScope" }));
    await user.click(await screen.findByRole("option", { name: "rangeSpecificTeacher" }));

    expect(screen.getByRole("combobox", { name: "rangeTeacherPlaceholder" })).toHaveAttribute(
      "data-kind",
      "teacher",
    );
  });
});
