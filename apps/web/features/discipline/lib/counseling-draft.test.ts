import { beforeEach, describe, expect, it } from "vitest";

import {
  clearCounselingDraft,
  loadCounselingDraft,
  parseCounselingDraft,
  saveCounselingDraft,
} from "./counseling-draft";

const BASE_DRAFT = {
  title: "Sesi konseling",
  content: "Catatan awal",
  followUpPlan: "",
  careerGoals: "",
  problemDescription: "",
};

describe("saveCounselingDraft / loadCounselingDraft", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips a draft scoped to its draft id", () => {
    saveCounselingDraft("new", BASE_DRAFT);
    const loaded = loadCounselingDraft("new");
    expect(loaded?.content).toBe("Catatan awal");
    expect(loaded?.title).toBe("Sesi konseling");
    expect(typeof loaded?.savedAt).toBe("string");
  });

  it("does not leak a draft across draft ids", () => {
    saveCounselingDraft("counseling-1", BASE_DRAFT);
    expect(loadCounselingDraft("new")).toBeNull();
  });

  it("returns null when nothing was ever saved", () => {
    expect(loadCounselingDraft("never-saved")).toBeNull();
  });

  it("clears a saved draft", () => {
    saveCounselingDraft("new", BASE_DRAFT);
    clearCounselingDraft("new");
    expect(loadCounselingDraft("new")).toBeNull();
  });
});

describe("parseCounselingDraft", () => {
  it("rejects malformed JSON", () => {
    expect(parseCounselingDraft("not json", "new")).toBeNull();
  });

  it("rejects a draft written for a different draft id", () => {
    const raw = JSON.stringify({ ...BASE_DRAFT, version: 1, draftId: "other", savedAt: "now" });
    expect(parseCounselingDraft(raw, "new")).toBeNull();
  });

  it("rejects a draft from a future/incompatible version", () => {
    const raw = JSON.stringify({ ...BASE_DRAFT, version: 99, draftId: "new", savedAt: "now" });
    expect(parseCounselingDraft(raw, "new")).toBeNull();
  });

  it("rejects a draft missing required fields", () => {
    const raw = JSON.stringify({ version: 1, draftId: "new" });
    expect(parseCounselingDraft(raw, "new")).toBeNull();
  });
});
