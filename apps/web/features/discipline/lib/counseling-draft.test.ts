import { beforeEach, describe, expect, it } from "vitest";

import {
  clearCounselingDraft,
  loadCounselingDraft,
  parseCounselingDraft,
  saveCounselingDraft,
} from "./counseling-draft";

const OWNER_A = "school-1:counselor-a";
const OWNER_B = "school-1:counselor-b";

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

  it("round-trips a draft scoped to its owner and draft id", () => {
    saveCounselingDraft(OWNER_A, "new", BASE_DRAFT);
    const loaded = loadCounselingDraft(OWNER_A, "new");
    expect(loaded?.content).toBe("Catatan awal");
    expect(loaded?.title).toBe("Sesi konseling");
    expect(loaded?.owner).toBe(OWNER_A);
    expect(typeof loaded?.savedAt).toBe("string");
  });

  it("does not leak a draft across draft ids", () => {
    saveCounselingDraft(OWNER_A, "counseling-1", BASE_DRAFT);
    expect(loadCounselingDraft(OWNER_A, "new")).toBeNull();
  });

  it("does not offer one account's draft to another account on the same record", () => {
    saveCounselingDraft(OWNER_A, "new", BASE_DRAFT);
    expect(loadCounselingDraft(OWNER_B, "new")).toBeNull();
    expect(loadCounselingDraft(`${OWNER_A}~admin-1`, "new")).toBeNull();
    expect(loadCounselingDraft(OWNER_A, "new")).not.toBeNull();
  });

  it("neither stores nor reads anything without an owner", () => {
    saveCounselingDraft(null, "new", BASE_DRAFT);
    expect(window.localStorage.length).toBe(0);
    saveCounselingDraft(OWNER_A, "new", BASE_DRAFT);
    expect(loadCounselingDraft(null, "new")).toBeNull();
  });

  it("returns null when nothing was ever saved", () => {
    expect(loadCounselingDraft(OWNER_A, "never-saved")).toBeNull();
  });

  it("clears a saved draft", () => {
    saveCounselingDraft(OWNER_A, "new", BASE_DRAFT);
    clearCounselingDraft(OWNER_A, "new");
    expect(loadCounselingDraft(OWNER_A, "new")).toBeNull();
  });
});

describe("parseCounselingDraft", () => {
  const valid = { ...BASE_DRAFT, version: 2, owner: OWNER_A, draftId: "new", savedAt: "now" };

  it("accepts a well-formed draft for its owner", () => {
    expect(parseCounselingDraft(OWNER_A, JSON.stringify(valid), "new")).not.toBeNull();
  });

  it("rejects malformed JSON", () => {
    expect(parseCounselingDraft(OWNER_A, "not json", "new")).toBeNull();
  });

  it("rejects a draft whose stored owner is someone else", () => {
    expect(parseCounselingDraft(OWNER_B, JSON.stringify(valid), "new")).toBeNull();
  });

  it("rejects a draft written for a different draft id", () => {
    const raw = JSON.stringify({ ...valid, draftId: "other" });
    expect(parseCounselingDraft(OWNER_A, raw, "new")).toBeNull();
  });

  it("rejects a version-1 draft, which has no owner", () => {
    const raw = JSON.stringify({ ...BASE_DRAFT, version: 1, draftId: "new", savedAt: "now" });
    expect(parseCounselingDraft(OWNER_A, raw, "new")).toBeNull();
  });

  it("rejects a draft from a future/incompatible version", () => {
    const raw = JSON.stringify({ ...valid, version: 99 });
    expect(parseCounselingDraft(OWNER_A, raw, "new")).toBeNull();
  });

  it("rejects a draft missing required fields", () => {
    const raw = JSON.stringify({ version: 2, owner: OWNER_A, draftId: "new" });
    expect(parseCounselingDraft(OWNER_A, raw, "new")).toBeNull();
  });
});
