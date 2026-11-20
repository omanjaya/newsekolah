import type * as UiModule from "@newsekolah/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { todayInZone } from "../../../lib/tenant-date";
import type { Journal } from "../api";
import { loadJournalDraft } from "../lib/journal-draft";

import { JournalForm } from "./journal-form";

const mutate = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const sameDay = vi.hoisted(() => ({ value: [] as Journal[] }));
// The teacher's taught pairs and the school's classes and subjects; the
// default is no assignment and one class and subject.
const lists = vi.hoisted(() => ({
  pairs: [] as { class_id: string; subject_id: string; is_active: boolean }[],
  classes: [{ id: "c1", name: "X-A" }],
  subjects: [{ id: "m1", name: "Matematika" }],
}));

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
  useTeachingAssignmentsForTeacherQuery: () => ({ data: { data: lists.pairs } }),
}));
vi.mock("../../reference/api", () => ({
  useClassesQuery: () => ({ data: { data: lists.classes }, isLoading: false }),
  useSubjectsQuery: () => ({ data: { data: lists.subjects }, isLoading: false }),
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
  lists.pairs = [];
  lists.classes = [{ id: "c1", name: "X-A" }];
  lists.subjects = [{ id: "m1", name: "Matematika" }];
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

function draftScope(lessonDate: string, journalId: string | null = null) {
  return { classId: "c1", subjectId: "m1", lessonDate, journalId };
}

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

  // A teacher with one taught pair gets class and subject filled in from
  // the narrowed pickers, never picked: opening the existing journal (which
  // locks and widens the pickers) must still keep its lesson.
  it("keeps the opened journal's lesson for a teacher with one taught pair", () => {
    const today = todayInZone("Asia/Jakarta");
    const existing = { ...saved, lesson_date: today };
    lists.pairs = [{ class_id: "c1", subject_id: "m1", is_active: true }];
    lists.classes = [
      { id: "c1", name: "X-A" },
      { id: "c2", name: "X-B" },
    ];
    lists.subjects = [
      { id: "m1", name: "Matematika" },
      { id: "m2", name: "Fisika" },
    ];
    sameDay.value = [existing];
    const onOpenExisting = vi.fn();
    render(<JournalForm onOpenExisting={onOpenExisting} onDone={vi.fn()} />);

    fill("Duplikat hari ini", "Uji duplikat");
    // An entry that clashes with a saved journal can never be saved, so its
    // text is not kept as a draft.
    expect(loadJournalDraft("me", draftScope(today))).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "openExisting" }));

    expect(onOpenExisting).toHaveBeenCalledWith(existing);
    expect(loadJournalDraft("me", draftScope(today))).toBeNull();
    expect(screen.getByRole("combobox", { name: "class" })).toHaveTextContent("X-A");
    expect(screen.getByRole("combobox", { name: "subject" })).toHaveTextContent("Matematika");

    fireEvent.change(screen.getByRole("textbox", { name: "reflection" }), {
      target: { value: "Refleksi baru" },
    });
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    expect(screen.queryByText("required")).not.toBeInTheDocument();
    expect(mutate).toHaveBeenCalledTimes(1);
    const [body] = mutate.mock.calls[0] as [Record<string, unknown>];
    expect(body).toMatchObject({
      id: "j1",
      class_id: "c1",
      subject_id: "m1",
      lesson_date: today,
      reflection: "Refleksi baru",
    });
  });

  it("leaves no draft of an opened journal's own text", () => {
    render(<JournalForm initial={saved} onDone={vi.fn()} />);
    expect(loadJournalDraft("me", draftScope("2026-11-20", "j1"))).toBeNull();

    // A real change is still kept, for a dropped connection.
    fireEvent.change(screen.getByRole("textbox", { name: "topic" }), {
      target: { value: "Fungsi kuadrat (revisi)" },
    });
    expect(loadJournalDraft("me", draftScope("2026-11-20", "j1"))?.topic).toBe(
      "Fungsi kuadrat (revisi)",
    );
    expect(loadJournalDraft("me", draftScope("2026-11-20"))).toBeNull();
  });

  // F22: a duplicate typed for a lesson that already has a journal, refused
  // and then cancelled, must not be offered later in that journal's editor,
  // where restoring it would overwrite the saved text.
  it("does not offer a refused duplicate's text to the saved journal's editor", () => {
    sameDay.value = [saved];
    renderForm();
    fill("Duplikat dibatalkan", "Kegiatan duplikat");
    fireEvent.click(screen.getByRole("button", { name: "submit" }));
    expect(toast.error).toHaveBeenCalledWith("JOURNAL_CONFLICT");
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    cleanup();

    render(<JournalForm initial={saved} onDone={vi.fn()} />);

    expect(screen.queryByText("draftFoundTitle")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "topic" })).toHaveValue("Fungsi kuadrat");
    expect(screen.getByRole("textbox", { name: "activities" })).toHaveValue("Menggambar grafik");
    expect(screen.getByRole("textbox", { name: "reflection" })).toHaveValue(
      "Titik puncak membingungkan",
    );
  });

  // A new entry mirrored before the same-day check knew of the saved
  // journal (or before someone else saved it) stays a new-entry draft; the
  // saved journal's editor never offers it, and the refused save drops it.
  it("keeps a new entry's earlier draft away from the saved journal and drops it on refusal", () => {
    renderForm();
    fill("Ditulis sebelum dicek", "Kegiatan");
    expect(loadJournalDraft("me", draftScope("2026-11-20"))?.topic).toBe("Ditulis sebelum dicek");
    cleanup();

    render(<JournalForm initial={saved} onDone={vi.fn()} />);
    expect(screen.queryByText("draftFoundTitle")).not.toBeInTheDocument();
    cleanup();

    sameDay.value = [saved];
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "draftRestore" }));
    fireEvent.click(screen.getByRole("button", { name: "submit" }));
    expect(toast.error).toHaveBeenCalledWith("JOURNAL_CONFLICT");
    expect(loadJournalDraft("me", draftScope("2026-11-20"))).toBeNull();
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
