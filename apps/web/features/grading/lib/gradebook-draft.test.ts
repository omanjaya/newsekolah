import { beforeEach, describe, expect, it } from "vitest";

import {
  clearGradebookDraft,
  loadGradebookDraft,
  parseGradebookDraft,
  saveGradebookDraft,
} from "./gradebook-draft";

const OWNER_A = "school-1:teacher-a";
const OWNER_B = "school-1:teacher-b";

const BASE_EDITS = { "component-1": { "student-1": "85" } };

describe("saveGradebookDraft / loadGradebookDraft", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips a draft scoped to its owner and sheet key", () => {
    saveGradebookDraft(OWNER_A, "class-1:subject-1", BASE_EDITS);
    const loaded = loadGradebookDraft(OWNER_A, "class-1:subject-1");
    expect(loaded?.edits).toEqual(BASE_EDITS);
    expect(loaded?.owner).toBe(OWNER_A);
    expect(typeof loaded?.savedAt).toBe("string");
  });

  it("does not leak a draft across sheets", () => {
    saveGradebookDraft(OWNER_A, "class-1:subject-1", BASE_EDITS);
    expect(loadGradebookDraft(OWNER_A, "class-2:subject-1")).toBeNull();
  });

  it("does not offer one account's draft to another account on the same sheet", () => {
    saveGradebookDraft(OWNER_A, "class-1:subject-1", BASE_EDITS);
    expect(loadGradebookDraft(OWNER_B, "class-1:subject-1")).toBeNull();
    expect(loadGradebookDraft(OWNER_A, "class-1:subject-1")).not.toBeNull();
  });

  it("neither stores nor reads anything without an owner", () => {
    saveGradebookDraft(null, "class-1:subject-1", BASE_EDITS);
    expect(window.localStorage.length).toBe(0);
    saveGradebookDraft(OWNER_A, "class-1:subject-1", BASE_EDITS);
    expect(loadGradebookDraft(null, "class-1:subject-1")).toBeNull();
  });

  it("returns null when nothing was ever saved", () => {
    expect(loadGradebookDraft(OWNER_A, "never-saved")).toBeNull();
  });

  it("clears a saved draft", () => {
    saveGradebookDraft(OWNER_A, "class-1:subject-1", BASE_EDITS);
    clearGradebookDraft(OWNER_A, "class-1:subject-1");
    expect(loadGradebookDraft(OWNER_A, "class-1:subject-1")).toBeNull();
  });
});

describe("parseGradebookDraft", () => {
  const valid = {
    edits: BASE_EDITS,
    version: 2,
    owner: OWNER_A,
    sheetKey: "class-1:subject-1",
    savedAt: "now",
  };

  it("accepts a well-formed draft for its owner", () => {
    expect(parseGradebookDraft(OWNER_A, JSON.stringify(valid), "class-1:subject-1")).not.toBeNull();
  });

  it("rejects malformed JSON", () => {
    expect(parseGradebookDraft(OWNER_A, "not json", "class-1:subject-1")).toBeNull();
  });

  it("rejects a draft whose stored owner is someone else", () => {
    expect(parseGradebookDraft(OWNER_B, JSON.stringify(valid), "class-1:subject-1")).toBeNull();
  });

  it("rejects a draft written for a different sheet key", () => {
    const raw = JSON.stringify({ ...valid, sheetKey: "other" });
    expect(parseGradebookDraft(OWNER_A, raw, "class-1:subject-1")).toBeNull();
  });

  it("rejects a version-1 draft, which has no owner", () => {
    const raw = JSON.stringify({
      edits: BASE_EDITS,
      version: 1,
      sheetKey: "class-1:subject-1",
      savedAt: "now",
    });
    expect(parseGradebookDraft(OWNER_A, raw, "class-1:subject-1")).toBeNull();
  });

  it("rejects a draft from a future/incompatible version", () => {
    const raw = JSON.stringify({ ...valid, version: 99 });
    expect(parseGradebookDraft(OWNER_A, raw, "class-1:subject-1")).toBeNull();
  });

  it("rejects a draft missing required fields", () => {
    const raw = JSON.stringify({ version: 2, owner: OWNER_A, sheetKey: "class-1:subject-1" });
    expect(parseGradebookDraft(OWNER_A, raw, "class-1:subject-1")).toBeNull();
  });
});
