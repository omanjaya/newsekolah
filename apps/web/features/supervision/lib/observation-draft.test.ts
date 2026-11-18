import { beforeEach, describe, expect, it } from "vitest";

import {
  clearObservationDraft,
  loadObservationDraft,
  parseObservationDraft,
  saveObservationDraft,
} from "./observation-draft";

const OWNER_A = "school-1:observer-a";
const OWNER_B = "school-1:observer-b";

const BASE_DRAFT = {
  scores: { punctuality: "3" },
  observerNotes: "Kelas berjalan lancar",
  observedAt: "2026-09-24T09:00",
};

describe("saveObservationDraft / loadObservationDraft", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips a draft scoped to its owner and scheduled id", () => {
    saveObservationDraft(OWNER_A, "scheduled-1", BASE_DRAFT);
    const loaded = loadObservationDraft(OWNER_A, "scheduled-1");
    expect(loaded?.scores).toEqual({ punctuality: "3" });
    expect(loaded?.observerNotes).toBe("Kelas berjalan lancar");
    expect(loaded?.owner).toBe(OWNER_A);
    expect(typeof loaded?.savedAt).toBe("string");
  });

  it("does not leak a draft across scheduled observations", () => {
    saveObservationDraft(OWNER_A, "scheduled-1", BASE_DRAFT);
    expect(loadObservationDraft(OWNER_A, "scheduled-2")).toBeNull();
  });

  it("does not offer one account's draft to another account on the same observation", () => {
    saveObservationDraft(OWNER_A, "scheduled-1", BASE_DRAFT);
    expect(loadObservationDraft(OWNER_B, "scheduled-1")).toBeNull();
    expect(loadObservationDraft(OWNER_A, "scheduled-1")).not.toBeNull();
  });

  it("neither stores nor reads anything without an owner", () => {
    saveObservationDraft(null, "scheduled-1", BASE_DRAFT);
    expect(window.localStorage.length).toBe(0);
    saveObservationDraft(OWNER_A, "scheduled-1", BASE_DRAFT);
    expect(loadObservationDraft(null, "scheduled-1")).toBeNull();
  });

  it("returns null when nothing was ever saved", () => {
    expect(loadObservationDraft(OWNER_A, "never-saved")).toBeNull();
  });

  it("clears a saved draft", () => {
    saveObservationDraft(OWNER_A, "scheduled-1", BASE_DRAFT);
    clearObservationDraft(OWNER_A, "scheduled-1");
    expect(loadObservationDraft(OWNER_A, "scheduled-1")).toBeNull();
  });
});

describe("parseObservationDraft", () => {
  const valid = {
    ...BASE_DRAFT,
    version: 2,
    owner: OWNER_A,
    scheduledId: "scheduled-1",
    savedAt: "now",
  };

  it("accepts a well-formed draft for its owner", () => {
    expect(parseObservationDraft(OWNER_A, JSON.stringify(valid), "scheduled-1")).not.toBeNull();
  });

  it("rejects malformed JSON", () => {
    expect(parseObservationDraft(OWNER_A, "not json", "scheduled-1")).toBeNull();
  });

  it("rejects a draft whose stored owner is someone else", () => {
    expect(parseObservationDraft(OWNER_B, JSON.stringify(valid), "scheduled-1")).toBeNull();
  });

  it("rejects a draft written for a different scheduled id", () => {
    const raw = JSON.stringify({ ...valid, scheduledId: "other" });
    expect(parseObservationDraft(OWNER_A, raw, "scheduled-1")).toBeNull();
  });

  it("rejects a version-1 draft, which has no owner", () => {
    const raw = JSON.stringify({
      ...BASE_DRAFT,
      version: 1,
      scheduledId: "scheduled-1",
      savedAt: "now",
    });
    expect(parseObservationDraft(OWNER_A, raw, "scheduled-1")).toBeNull();
  });

  it("rejects a draft from a future/incompatible version", () => {
    const raw = JSON.stringify({ ...valid, version: 99 });
    expect(parseObservationDraft(OWNER_A, raw, "scheduled-1")).toBeNull();
  });

  it("rejects a draft missing required fields", () => {
    const raw = JSON.stringify({ version: 2, owner: OWNER_A, scheduledId: "scheduled-1" });
    expect(parseObservationDraft(OWNER_A, raw, "scheduled-1")).toBeNull();
  });
});
