import type * as UiModule from "@newsekolah/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SupervisionCycle } from "../api";

import { SupervisionCycleForm } from "./supervision-cycle-form";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) =>
    values?.index ? `${key} ${values.index}` : key,
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return {
    ...actual,
    DialogFooter: ({ children }: { children: unknown }) => children,
    useToast: () => ({ success: vi.fn(), error: vi.fn() }),
  };
});
vi.mock("../api", () => ({
  useCreateSupervisionCycleMutation: () => ({ isPending: false, mutate: mocks.create }),
  useUpdateSupervisionCycleMutation: () => ({ isPending: false, mutate: mocks.update }),
}));

afterEach(() => {
  cleanup();
  mocks.create.mockReset();
  mocks.update.mockReset();
});

const legacyCycle = {
  id: "c1",
  name: "Semester ganjil",
  instrument: {
    name: "Instrumen",
    scale_min: 1,
    scale_max: 4,
    criteria: [
      { key: "pk", name: "Penguasaan kelas" },
      { key: "pk_2", name: "Penguasaan kelas" },
    ],
  },
} as SupervisionCycle;

function fillCycle() {
  const [cycleName, instrumentName] = screen.getAllByPlaceholderText("namePlaceholder");
  if (!cycleName || !instrumentName) throw new Error("name inputs missing");
  fireEvent.change(cycleName, { target: { value: "Semester ganjil" } });
  fireEvent.change(instrumentName, { target: { value: "Instrumen" } });
}

describe("SupervisionCycleForm", () => {
  it("blocks Save when two criteria carry the same name", () => {
    render(<SupervisionCycleForm onDone={vi.fn()} />);
    fillCycle();
    fireEvent.change(screen.getByRole("textbox", { name: "criterionNameLabel 1" }), {
      target: { value: "Penguasaan kelas" },
    });
    fireEvent.click(screen.getByRole("button", { name: "addCriterion" }));
    fireEvent.change(screen.getByRole("textbox", { name: "criterionNameLabel 2" }), {
      target: { value: "Penguasaan kelas" },
    });
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    expect(screen.getByText("errors.criteriaNameDuplicate")).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("saves an existing cycle whose names already repeated before the rule", () => {
    render(<SupervisionCycleForm initial={legacyCycle} onDone={vi.fn()} />);
    // The stored repetition is not marked: the inline errors agree with Save.
    expect(screen.queryByText("criterionNameDuplicate")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    expect(screen.queryByText("errors.criteriaNameDuplicate")).not.toBeInTheDocument();
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("blocks Save when a third copy of a name that already repeated is added", () => {
    render(<SupervisionCycleForm initial={legacyCycle} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "addCriterion" }));
    fireEvent.change(screen.getByRole("textbox", { name: "criterionNameLabel 3" }), {
      target: { value: "Penguasaan Kelas" },
    });
    expect(screen.getAllByText("criterionNameDuplicate")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    expect(screen.getByText("errors.criteriaNameDuplicate")).toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
