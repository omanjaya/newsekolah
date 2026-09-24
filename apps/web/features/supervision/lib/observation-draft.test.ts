import { beforeEach, describe, expect, it } from "vitest";

import {
  clearObservationDraft,
  loadObservationDraft,
  parseObservationDraft,
  saveObservationDraft,
} from "./observation-draft";

const BASE_DRAFT = {
  scores: { punctuality: "3" },
  observerNotes: "Kelas berjalan lancar",
  observedAt: "2026-09-24T09:00",
};

describe("saveObservationDraft / loadObservationDraft", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips a draft scoped to its scheduled id", () => {
    saveObservationDraft("scheduled-1", BASE_DRAFT);
    const loaded = loadObservationDraft("scheduled-1");
    expect(loaded?.scores).toEqual({ punctuality: "3" });
    expect(loaded?.observerNotes).toBe("Kelas berjalan lancar");
    expect(typeof loaded?.savedAt).toBe("string");
  });

  it("does not leak a draft across scheduled observations", () => {
    saveObservationDraft("scheduled-1", BASE_DRAFT);
    expect(loadObservationDraft("scheduled-2")).toBeNull();
  });

  it("returns null when nothing was ever saved", () => {
    expect(loadObservationDraft("never-saved")).toBeNull();
  });

  it("clears a saved draft", () => {
    saveObservationDraft("scheduled-1", BASE_DRAFT);
    clearObservationDraft("scheduled-1");
    expect(loadObservationDraft("scheduled-1")).toBeNull();
  });
});

describe("parseObservationDraft", () => {
  it("rejects malformed JSON", () => {
    expect(parseObservationDraft("not json", "scheduled-1")).toBeNull();
  });

  it("rejects a draft written for a different scheduled id", () => {
    const raw = JSON.stringify({
      ...BASE_DRAFT,
      version: 1,
      scheduledId: "other",
      savedAt: "now",
    });
    expect(parseObservationDraft(raw, "scheduled-1")).toBeNull();
  });

  it("rejects a draft from a future/incompatible version", () => {
    const raw = JSON.stringify({
      ...BASE_DRAFT,
      version: 99,
      scheduledId: "scheduled-1",
      savedAt: "now",
    });
    expect(parseObservationDraft(raw, "scheduled-1")).toBeNull();
  });

  it("rejects a draft missing required fields", () => {
    const raw = JSON.stringify({ version: 1, scheduledId: "scheduled-1" });
    expect(parseObservationDraft(raw, "scheduled-1")).toBeNull();
  });
});
