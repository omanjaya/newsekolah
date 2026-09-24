import { beforeEach, describe, expect, it } from "vitest";

import {
  clearGradebookDraft,
  loadGradebookDraft,
  parseGradebookDraft,
  saveGradebookDraft,
} from "./gradebook-draft";

const BASE_EDITS = { "component-1": { "student-1": "85" } };

describe("saveGradebookDraft / loadGradebookDraft", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips a draft scoped to its sheet key", () => {
    saveGradebookDraft("class-1:subject-1", BASE_EDITS);
    const loaded = loadGradebookDraft("class-1:subject-1");
    expect(loaded?.edits).toEqual(BASE_EDITS);
    expect(typeof loaded?.savedAt).toBe("string");
  });

  it("does not leak a draft across sheets", () => {
    saveGradebookDraft("class-1:subject-1", BASE_EDITS);
    expect(loadGradebookDraft("class-2:subject-1")).toBeNull();
  });

  it("returns null when nothing was ever saved", () => {
    expect(loadGradebookDraft("never-saved")).toBeNull();
  });

  it("clears a saved draft", () => {
    saveGradebookDraft("class-1:subject-1", BASE_EDITS);
    clearGradebookDraft("class-1:subject-1");
    expect(loadGradebookDraft("class-1:subject-1")).toBeNull();
  });
});

describe("parseGradebookDraft", () => {
  it("rejects malformed JSON", () => {
    expect(parseGradebookDraft("not json", "class-1:subject-1")).toBeNull();
  });

  it("rejects a draft written for a different sheet key", () => {
    const raw = JSON.stringify({
      edits: BASE_EDITS,
      version: 1,
      sheetKey: "other",
      savedAt: "now",
    });
    expect(parseGradebookDraft(raw, "class-1:subject-1")).toBeNull();
  });

  it("rejects a draft from a future/incompatible version", () => {
    const raw = JSON.stringify({
      edits: BASE_EDITS,
      version: 99,
      sheetKey: "class-1:subject-1",
      savedAt: "now",
    });
    expect(parseGradebookDraft(raw, "class-1:subject-1")).toBeNull();
  });

  it("rejects a draft missing required fields", () => {
    const raw = JSON.stringify({ version: 1, sheetKey: "class-1:subject-1" });
    expect(parseGradebookDraft(raw, "class-1:subject-1")).toBeNull();
  });
});
