import { beforeEach, describe, expect, it } from "vitest";

import {
  clearJournalDraft,
  loadJournalDraft,
  parseJournalDraft,
  saveJournalDraft,
} from "./journal-draft";

const OWNER_A = "school-1:teacher-a";
const OWNER_B = "school-1:teacher-b";

const BASE_DRAFT = { topic: "Pecahan", activities: "Latihan soal", reflection: "" };

function scope(classId = "class-1", subjectId = "subject-1", lessonDate = "2026-09-21") {
  return { classId, subjectId, lessonDate, journalId: null };
}

describe("saveJournalDraft / loadJournalDraft", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips a draft scoped to its owner and class/subject/date", () => {
    saveJournalDraft(OWNER_A, scope("class-1", "subject-1", "2026-09-21"), BASE_DRAFT);
    const loaded = loadJournalDraft(OWNER_A, scope("class-1", "subject-1", "2026-09-21"));
    expect(loaded?.topic).toBe("Pecahan");
    expect(loaded?.owner).toBe(OWNER_A);
    expect(typeof loaded?.savedAt).toBe("string");
  });

  it("does not leak a draft across a different class, subject, or date", () => {
    saveJournalDraft(OWNER_A, scope("class-1", "subject-1", "2026-09-21"), BASE_DRAFT);
    expect(loadJournalDraft(OWNER_A, scope("class-2", "subject-1", "2026-09-21"))).toBeNull();
    expect(loadJournalDraft(OWNER_A, scope("class-1", "subject-2", "2026-09-21"))).toBeNull();
    expect(loadJournalDraft(OWNER_A, scope("class-1", "subject-1", "2026-09-22"))).toBeNull();
  });

  it("does not offer one account's draft to another account on the same lesson", () => {
    saveJournalDraft(OWNER_A, scope("class-1", "subject-1", "2026-09-21"), BASE_DRAFT);
    expect(loadJournalDraft(OWNER_B, scope("class-1", "subject-1", "2026-09-21"))).toBeNull();
    expect(loadJournalDraft(OWNER_A, scope("class-1", "subject-1", "2026-09-21"))).not.toBeNull();
  });

  it("neither stores nor reads anything without an owner", () => {
    saveJournalDraft(null, scope("class-1", "subject-1", "2026-09-21"), BASE_DRAFT);
    expect(window.localStorage.length).toBe(0);
    saveJournalDraft(OWNER_A, scope("class-1", "subject-1", "2026-09-21"), BASE_DRAFT);
    expect(loadJournalDraft(null, scope("class-1", "subject-1", "2026-09-21"))).toBeNull();
  });

  it("keeps a new entry's draft apart from the edits to a saved journal of the same lesson", () => {
    saveJournalDraft(OWNER_A, scope(), BASE_DRAFT);
    expect(loadJournalDraft(OWNER_A, { ...scope(), journalId: "journal-1" })).toBeNull();

    saveJournalDraft(
      OWNER_A,
      { ...scope(), journalId: "journal-1" },
      { ...BASE_DRAFT, topic: "Edit" },
    );
    expect(loadJournalDraft(OWNER_A, { ...scope(), journalId: "journal-1" })?.topic).toBe("Edit");
    expect(loadJournalDraft(OWNER_A, { ...scope(), journalId: "journal-2" })).toBeNull();
    expect(loadJournalDraft(OWNER_A, scope())?.topic).toBe("Pecahan");
  });

  it("returns null when nothing was ever saved", () => {
    expect(loadJournalDraft(OWNER_A, scope("class-x", "subject-x", "2026-09-21"))).toBeNull();
  });

  it("clears a saved draft", () => {
    saveJournalDraft(OWNER_A, scope("class-1", "subject-1", "2026-09-21"), BASE_DRAFT);
    clearJournalDraft(OWNER_A, scope("class-1", "subject-1", "2026-09-21"));
    expect(loadJournalDraft(OWNER_A, scope("class-1", "subject-1", "2026-09-21"))).toBeNull();
  });
});

describe("parseJournalDraft", () => {
  const valid = {
    ...BASE_DRAFT,
    version: 3,
    owner: OWNER_A,
    classId: "class-1",
    subjectId: "subject-1",
    lessonDate: "2026-09-21",
    journalId: null,
    savedAt: "now",
  };

  function parse(owner: string, raw: string) {
    return parseJournalDraft(owner, raw, scope());
  }

  it("accepts a well-formed draft for its owner", () => {
    expect(parse(OWNER_A, JSON.stringify(valid))).not.toBeNull();
  });

  it("rejects malformed JSON", () => {
    expect(parse(OWNER_A, "not json")).toBeNull();
  });

  it("rejects a draft whose stored owner is someone else", () => {
    expect(parse(OWNER_B, JSON.stringify(valid))).toBeNull();
  });

  it("rejects a draft written for a different scope", () => {
    expect(parse(OWNER_A, JSON.stringify({ ...valid, classId: "other" }))).toBeNull();
  });

  it("rejects a draft typed for another journal of the same lesson", () => {
    expect(parse(OWNER_A, JSON.stringify({ ...valid, journalId: "journal-1" }))).toBeNull();
  });

  it("rejects a version-2 draft, which does not say which journal it belongs to", () => {
    const { journalId: _journalId, ...unscoped } = valid;
    expect(parse(OWNER_A, JSON.stringify({ ...unscoped, version: 2 }))).toBeNull();
  });

  it("rejects a version-1 draft, which has no owner", () => {
    const raw = JSON.stringify({
      ...BASE_DRAFT,
      version: 1,
      classId: "class-1",
      subjectId: "subject-1",
      lessonDate: "2026-09-21",
      savedAt: "now",
    });
    expect(parse(OWNER_A, raw)).toBeNull();
  });

  it("rejects a draft from a future/incompatible version", () => {
    expect(parse(OWNER_A, JSON.stringify({ ...valid, version: 99 }))).toBeNull();
  });

  it("rejects a draft missing required fields", () => {
    const raw = JSON.stringify({
      version: 3,
      owner: OWNER_A,
      classId: "class-1",
      subjectId: "subject-1",
    });
    expect(parse(OWNER_A, raw)).toBeNull();
  });
});
