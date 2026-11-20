import type * as UiModule from "@newsekolah/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Journal } from "../api";

import { JournalForm } from "./journal-form";

const mutate = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const sameDay = vi.hoisted(() => ({ value: [] as Journal[] }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "id",
}));
vi.mock("@newsekolah/ui", async () => {
  const actual = await vi.importActual<typeof UiModule>("@newsekolah/ui");
  return { ...actual, useToast: () => toast };
});
vi.mock("../../../lib/drafts/draft-owner", () => ({ useDraftOwner: () => "me" }));
vi.mock("../../../lib/hooks/use-active-year", () => ({ useActiveYear: () => ({ id: "year-1" }) }));
vi.mock("../../../lib/i18n/api-error-message", () => ({
  useApiErrorMessage: () => (key: string) => key,
}));
vi.mock("../../../lib/session/session-provider", () => ({
  useSession: () => ({ me: { id: "me", tenant: { timezone: "Asia/Jakarta" } } }),
}));
vi.mock("../../academic/api-offerings", () => ({
  useTeachingAssignmentsForTeacherQuery: () => ({ data: { data: [] } }),
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: [{ id: "c1", name: "X-A" }] }, isLoading: false }),
  useSubjectsQuery: () => ({
    data: { data: [{ id: "m1", name: "Matematika" }] },
    isLoading: false,
  }),
}));
vi.mock("../api", () => ({
  useUpsertJournalMutation: () => ({ mutate, isPending: false }),
  useJournalsQuery: () => ({ data: { data: sameDay.value, total: 0 }, refetch: vi.fn() }),
}));

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

afterEach(() => {
  cleanup();
  mutate.mockReset();
  toast.error.mockReset();
  sameDay.value = [];
  window.localStorage.clear();
});

const saved: Journal = {
  id: "j1",
  academic_year_id: "year-1",
  teacher_user_id: "me",
  class_id: "c1",
  subject_id: "m1",
  lesson_date: "2026-11-20",
  topic: "Fungsi kuadrat",
  activities: "Menggambar grafik",
  reflection: "Titik puncak membingungkan",
} as Journal;

function renderForm() {
  render(
    <JournalForm
      prefillClassId="c1"
      prefillSubjectId="m1"
      prefillDate="2026-11-20"
      onDone={vi.fn()}
    />,
  );
}

function fill(topic: string, activities: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "topic" }), { target: { value: topic } });
  fireEvent.change(screen.getByRole("textbox", { name: "activities" }), {
    target: { value: activities },
  });
}

describe("JournalForm", () => {
  it("does not send a second journal for a lesson that already has one", () => {
    sameDay.value = [saved];
    renderForm();

    expect(screen.getByText("existsTitle")).toBeInTheDocument();
    fill("Duplikat hari ini", "Uji duplikat");
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    expect(mutate).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("JOURNAL_CONFLICT");
  });

  it("opens the existing journal for editing, and saves it by id", () => {
    sameDay.value = [saved];
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "openExisting" }));
    const topic = screen.getByRole("textbox", { name: "topic" });
    expect(topic).toHaveValue("Fungsi kuadrat");
    expect(screen.queryByText("existsTitle")).not.toBeInTheDocument();

    fireEvent.change(topic, { target: { value: "Fungsi kuadrat (revisi)" } });
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    expect(mutate).toHaveBeenCalledTimes(1);
    const [body] = mutate.mock.calls[0] as [Record<string, unknown>];
    expect(body).toMatchObject({ id: "j1", topic: "Fungsi kuadrat (revisi)" });
  });

  it("sends one request for a double click on Simpan", () => {
    renderForm();
    fill("Persamaan linear", "Latihan soal");

    const submit = screen.getByRole("button", { name: "submit" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(mutate).toHaveBeenCalledTimes(1);
    const [body] = mutate.mock.calls[0] as [Record<string, unknown>];
    expect(body).not.toHaveProperty("id");
  });
});
