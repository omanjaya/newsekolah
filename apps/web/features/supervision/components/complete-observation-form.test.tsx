import type * as UiModule from "@newsekolah/ui";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ complete: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations:
    () =>
    (key: string, values?: Record<string, string | number>): string =>
      values ? `${key}:${Object.values(values).join("|")}` : key,
  useLocale: () => "id",
}));
vi.mock("../../../components/app-page", () => import("../../../test/app-page-stub"));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (code: string) => code,
}));
vi.mock("../api", () => ({
  useCompleteObservationMutation: () => ({ mutateAsync: mocks.complete, isPending: false }),
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

import { CompleteObservationForm } from "./complete-observation-form";

const instrument = {
  name: "Instrumen kelas",
  scale_min: 1,
  scale_max: 4,
  criteria: [
    { key: "opening", name: "Membuka pelajaran" },
    { key: "closing", name: "Menutup pelajaran" },
  ],
};

const scheduled = {
  id: "scheduled-1",
  cycle_id: "cycle-1",
  schedule_id: "schedule-1",
  lesson_date: "2026-11-14",
  teacher_user_id: "teacher-1",
  observer_user_id: "observer-1",
};

function renderForm(onDone = vi.fn()) {
  render(
    <CompleteObservationForm
      scheduled={scheduled}
      instrument={instrument}
      title="Bu Rina"
      breadcrumb={[{ label: "Siklus" }]}
      onDone={onDone}
    />,
  );
  return onDone;
}

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
  mocks.complete.mockReset();
  window.localStorage.clear();
});

describe("CompleteObservationForm", () => {
  it("names what is missing instead of saving an incomplete observation", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "submit" }));
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(screen.getAllByText("scoreMissing")).toHaveLength(2);
    expect(screen.getByText("observerNotesRequired")).toBeInTheDocument();
  });

  it("shows the running average and saves every score with the notes", async () => {
    mocks.complete.mockResolvedValue({});
    const user = userEvent.setup();
    const onDone = renderForm();

    const opening = screen.getByRole("radiogroup", { name: "scoreFor:1|Membuka pelajaran" });
    const closing = screen.getByRole("radiogroup", { name: "scoreFor:2|Menutup pelajaran" });
    await user.click(within(opening).getByRole("radio", { name: "3" }));
    expect(screen.getByText(/progressWithAverage:.*\|3,00/)).toBeInTheDocument();
    await user.click(within(closing).getByRole("radio", { name: "4" }));
    await user.type(screen.getByRole("textbox", { name: "observerNotes" }), "Pembukaan jelas");
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduled_id: "scheduled-1",
        scores: [
          { criterion_key: "opening", score: 3 },
          { criterion_key: "closing", score: 4 },
        ],
        observer_notes: "Pembukaan jelas",
      }),
    );
    expect(onDone).toHaveBeenCalled();
  });
});
