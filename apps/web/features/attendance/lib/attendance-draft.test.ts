import { beforeEach, describe, expect, it } from "vitest";

import {
  clearSimulation,
  setSimulation,
  syncSimulationIdentity,
} from "../../../lib/simulation/clock";

import {
  clearAttendanceDraft,
  loadAttendanceDraft,
  parseAttendanceDraft,
  saveAttendanceDraft,
} from "./attendance-draft";

const OWNER_A = "school-1:teacher-a";
const OWNER_B = "school-1:teacher-b";

function superadmin() {
  return {
    id: "admin",
    permissions: ["platform_superadmin"],
    tenant: { tenant_id: "school", timezone: "Asia/Jakarta", name: "School", locale: "id" },
  } as unknown as Parameters<typeof syncSimulationIdentity>[0];
}

const BASE_DRAFT = {
  statuses: { s1: "H" },
  notes: { s1: "" },
  violations: {},
  topic: "Pecahan",
  activities: "Latihan soal",
  reflection: "",
};

describe("saveAttendanceDraft / loadAttendanceDraft", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips a draft scoped to its owner and session id", () => {
    saveAttendanceDraft(OWNER_A, "session-1", BASE_DRAFT);
    const loaded = loadAttendanceDraft(OWNER_A, "session-1");
    expect(loaded?.statuses).toEqual({ s1: "H" });
    expect(loaded?.topic).toBe("Pecahan");
    expect(loaded?.owner).toBe(OWNER_A);
    expect(typeof loaded?.savedAt).toBe("string");
  });

  it("does not leak a draft across sessions", () => {
    saveAttendanceDraft(OWNER_A, "session-1", BASE_DRAFT);
    expect(loadAttendanceDraft(OWNER_A, "session-2")).toBeNull();
  });

  it("does not offer one account's draft to another account on the same session", () => {
    saveAttendanceDraft(OWNER_A, "session-1", BASE_DRAFT);
    expect(loadAttendanceDraft(OWNER_B, "session-1")).toBeNull();
    expect(loadAttendanceDraft(OWNER_A, "session-1")).not.toBeNull();
  });

  it("neither stores nor reads anything without an owner", () => {
    saveAttendanceDraft(null, "session-1", BASE_DRAFT);
    expect(window.localStorage.length).toBe(0);
    saveAttendanceDraft(OWNER_A, "session-1", BASE_DRAFT);
    expect(loadAttendanceDraft(null, "session-1")).toBeNull();
  });

  it("returns null when nothing was ever saved", () => {
    expect(loadAttendanceDraft(OWNER_A, "never-saved")).toBeNull();
  });

  it("clears a saved draft", () => {
    saveAttendanceDraft(OWNER_A, "session-1", BASE_DRAFT);
    clearAttendanceDraft(OWNER_A, "session-1");
    expect(loadAttendanceDraft(OWNER_A, "session-1")).toBeNull();
  });

  it("stamps a draft with the simulated business clock, not the real one", () => {
    syncSimulationIdentity(superadmin());
    setSimulation("frozen", new Date("2026-09-30T00:15:00Z"));
    try {
      saveAttendanceDraft(OWNER_A, "session-1", BASE_DRAFT);
      expect(loadAttendanceDraft(OWNER_A, "session-1")?.savedAt).toBe("2026-09-30T00:15:00.000Z");
    } finally {
      clearSimulation();
      syncSimulationIdentity(undefined);
    }
  });
});

describe("parseAttendanceDraft", () => {
  const valid = {
    ...BASE_DRAFT,
    version: 2,
    owner: OWNER_A,
    sessionId: "session-1",
    savedAt: "now",
  };

  it("accepts a well-formed draft for its owner", () => {
    expect(parseAttendanceDraft(OWNER_A, JSON.stringify(valid), "session-1")).not.toBeNull();
  });

  it("rejects malformed JSON", () => {
    expect(parseAttendanceDraft(OWNER_A, "not json", "session-1")).toBeNull();
  });

  it("rejects a draft whose stored owner is someone else", () => {
    expect(parseAttendanceDraft(OWNER_B, JSON.stringify(valid), "session-1")).toBeNull();
  });

  it("rejects a draft written for a different session id", () => {
    const raw = JSON.stringify({ ...valid, sessionId: "other" });
    expect(parseAttendanceDraft(OWNER_A, raw, "session-1")).toBeNull();
  });

  it("rejects a version-1 draft, which has no owner", () => {
    const raw = JSON.stringify({
      ...BASE_DRAFT,
      version: 1,
      sessionId: "session-1",
      savedAt: "now",
    });
    expect(parseAttendanceDraft(OWNER_A, raw, "session-1")).toBeNull();
  });

  it("rejects a draft from a future/incompatible version", () => {
    const raw = JSON.stringify({ ...valid, version: 99 });
    expect(parseAttendanceDraft(OWNER_A, raw, "session-1")).toBeNull();
  });

  it("rejects a draft missing required fields", () => {
    const raw = JSON.stringify({ version: 2, owner: OWNER_A, sessionId: "session-1" });
    expect(parseAttendanceDraft(OWNER_A, raw, "session-1")).toBeNull();
  });
});
