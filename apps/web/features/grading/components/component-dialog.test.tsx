import type * as UiModule from "@newsekolah/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AssessmentComponent } from "../api";

const { create, update, remove } = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../api", () => ({
  // `isPending` stays false: a fast double click lands before TanStack
  // Query's batched notification re-renders the button as loading.
  useCreateComponentMutation: () => ({ mutateAsync: create, isPending: false }),
  useUpdateComponentMutation: () => ({ mutateAsync: update, isPending: false }),
  useDeleteComponentMutation: () => ({ mutateAsync: remove, isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { ComponentDialog } from "./component-dialog";

const PTS: AssessmentComponent = {
  id: "c1",
  class_id: "class-1",
  subject_id: "subject-1",
  term_id: "term-1",
  code: "PTS",
  kind: "summative",
  description: "Penilaian tengah semester",
  weight: 2,
  sequence: 3,
  kktp: 75,
};

afterEach(() => {
  cleanup();
  create.mockReset();
  update.mockReset();
  remove.mockReset();
});

function renderDialog(target: AssessmentComponent | "new", hasScores = false) {
  render(
    <ComponentDialog
      onOpenChange={vi.fn()}
      classId="class-1"
      subjectId="subject-1"
      termId="term-1"
      nextSequence={4}
      target={target}
      hasScores={hasScores}
    />,
  );
}

describe("ComponentDialog", () => {
  it("keeps the description when an existing component is saved unchanged", async () => {
    update.mockResolvedValue(undefined);
    renderDialog(PTS);
    expect(screen.getByDisplayValue("Penilaian tengah semester")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => {
      expect(update).toHaveBeenCalledTimes(1);
    });
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      id: "c1",
      body: { code: "PTS", description: "Penilaian tengah semester", kktp: 75 },
    });
  });

  it("lets a teacher write a description for a new component", async () => {
    create.mockResolvedValue(undefined);
    renderDialog("new");
    fireEvent.change(screen.getByLabelText("code"), { target: { value: "TG1" } });
    fireEvent.change(screen.getByLabelText("description"), {
      target: { value: "Tugas harian 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
    expect(create.mock.calls[0]?.[0]).toMatchObject({ code: "TG1", description: "Tugas harian 1" });
  });

  it("creates the component once for a double click on Simpan", async () => {
    let settle: () => void = () => undefined;
    create.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    renderDialog("new");
    fireEvent.change(screen.getByLabelText("code"), { target: { value: "TMP" } });
    const save = screen.getByRole("button", { name: "save" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(create).toHaveBeenCalledTimes(1);
    settle();
    await waitFor(() => {
      expect(create).toHaveBeenCalledTimes(1);
    });
  });

  it("does not offer Delete while the column still holds scores", () => {
    renderDialog(PTS, true);
    const deleteButton = screen.getByRole("button", { name: "delete" });
    expect(deleteButton).toBeDisabled();
    expect(deleteButton).toHaveAccessibleDescription("deleteBlocked");
  });

  it("offers Delete for an empty column", () => {
    renderDialog(PTS, false);
    expect(screen.getByRole("button", { name: "delete" })).toBeEnabled();
    expect(screen.queryByText("deleteBlocked")).not.toBeInTheDocument();
  });
});
