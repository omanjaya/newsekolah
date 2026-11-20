import type * as UiModule from "@newsekolah/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useLocale: () => "id",
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../api", () => ({
  useSetManualReportScoreMutation: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { ManualScoreDialog } from "./manual-score-dialog";

function renderDialog(currentManualScore?: number) {
  return render(
    <ManualScoreDialog
      onOpenChange={vi.fn()}
      classId="class-1"
      subjectId="subject-1"
      termId="term-1"
      studentId="s1"
      studentName="Siswa Dua Contoh"
      computedAverage={86.14}
      currentManualScore={currentManualScore}
      decimals={2}
    />,
  );
}

beforeEach(() => {
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
});

describe("ManualScoreDialog", () => {
  // grades-discipline-R2: reopened on an override, the field was empty and
  // a plain Simpan sent manual_score null, which removes the override.
  it("opens on the current override and keeps it on a plain save", async () => {
    renderDialog(75.5);

    expect(screen.getByRole("spinbutton", { name: "score" })).toHaveValue("75,5");
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ manual_score: 75.5 }));
    });
  });

  it("starts empty without an override, and an empty save clears it", async () => {
    renderDialog(undefined);

    expect(screen.getByRole("spinbutton", { name: "score" })).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ manual_score: null }));
    });
  });
});
