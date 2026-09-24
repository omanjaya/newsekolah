import { beforeEach, describe, expect, it } from "vitest";

import {
  clearJournalDraft,
  loadJournalDraft,
  parseJournalDraft,
  saveJournalDraft,
} from "./journal-draft";

const BASE_DRAFT = { topic: "Pecahan", activities: "Latihan soal", reflection: "" };

describe("saveJournalDraft / loadJournalDraft", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips a draft scoped to its class/subject/date", () => {
    saveJournalDraft("class-1", "subject-1", "2026-09-21", BASE_DRAFT);
    const loaded = loadJournalDraft("class-1", "subject-1", "2026-09-21");
    expect(loaded?.topic).toBe("Pecahan");
    expect(typeof loaded?.savedAt).toBe("string");
  });

  it("does not leak a draft across a different class, subject, or date", () => {
    saveJournalDraft("class-1", "subject-1", "2026-09-21", BASE_DRAFT);
    expect(loadJournalDraft("class-2", "subject-1", "2026-09-21")).toBeNull();
    expect(loadJournalDraft("class-1", "subject-2", "2026-09-21")).toBeNull();
    expect(loadJournalDraft("class-1", "subject-1", "2026-09-22")).toBeNull();
  });

  it("returns null when nothing was ever saved", () => {
    expect(loadJournalDraft("class-x", "subject-x", "2026-09-21")).toBeNull();
  });

  it("clears a saved draft", () => {
    saveJournalDraft("class-1", "subject-1", "2026-09-21", BASE_DRAFT);
    clearJournalDraft("class-1", "subject-1", "2026-09-21");
    expect(loadJournalDraft("class-1", "subject-1", "2026-09-21")).toBeNull();
  });
});

describe("parseJournalDraft", () => {
  it("rejects malformed JSON", () => {
    expect(parseJournalDraft("not json", "class-1", "subject-1", "2026-09-21")).toBeNull();
  });

  it("rejects a draft written for a different scope", () => {
    const raw = JSON.stringify({
      ...BASE_DRAFT,
      version: 1,
      classId: "other",
      subjectId: "subject-1",
      lessonDate: "2026-09-21",
      savedAt: "now",
    });
    expect(parseJournalDraft(raw, "class-1", "subject-1", "2026-09-21")).toBeNull();
  });

  it("rejects a draft from a future/incompatible version", () => {
    const raw = JSON.stringify({
      ...BASE_DRAFT,
      version: 99,
      classId: "class-1",
      subjectId: "subject-1",
      lessonDate: "2026-09-21",
      savedAt: "now",
    });
    expect(parseJournalDraft(raw, "class-1", "subject-1", "2026-09-21")).toBeNull();
  });

  it("rejects a draft missing required fields", () => {
    const raw = JSON.stringify({ version: 1, classId: "class-1", subjectId: "subject-1" });
    expect(parseJournalDraft(raw, "class-1", "subject-1", "2026-09-21")).toBeNull();
  });
});
