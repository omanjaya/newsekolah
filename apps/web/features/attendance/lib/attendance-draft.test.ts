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

  it("round-trips a draft scoped to its session id", () => {
    saveAttendanceDraft("session-1", BASE_DRAFT);
    const loaded = loadAttendanceDraft("session-1");
    expect(loaded?.statuses).toEqual({ s1: "H" });
    expect(loaded?.topic).toBe("Pecahan");
    expect(typeof loaded?.savedAt).toBe("string");
  });

  it("does not leak a draft across sessions", () => {
    saveAttendanceDraft("session-1", BASE_DRAFT);
    expect(loadAttendanceDraft("session-2")).toBeNull();
  });

  it("returns null when nothing was ever saved", () => {
    expect(loadAttendanceDraft("never-saved")).toBeNull();
  });

  it("clears a saved draft", () => {
    saveAttendanceDraft("session-1", BASE_DRAFT);
    clearAttendanceDraft("session-1");
    expect(loadAttendanceDraft("session-1")).toBeNull();
  });

  it("stamps a draft with the simulated business clock, not the real one", () => {
    syncSimulationIdentity(superadmin());
    setSimulation("frozen", new Date("2026-09-30T00:15:00Z"));
    try {
      saveAttendanceDraft("session-1", BASE_DRAFT);
      expect(loadAttendanceDraft("session-1")?.savedAt).toBe("2026-09-30T00:15:00.000Z");
    } finally {
      clearSimulation();
      syncSimulationIdentity(undefined);
    }
  });
});

describe("parseAttendanceDraft", () => {
  it("rejects malformed JSON", () => {
    expect(parseAttendanceDraft("not json", "session-1")).toBeNull();
  });

  it("rejects a draft written for a different session id", () => {
    const raw = JSON.stringify({ ...BASE_DRAFT, version: 1, sessionId: "other", savedAt: "now" });
    expect(parseAttendanceDraft(raw, "session-1")).toBeNull();
  });

  it("rejects a draft from a future/incompatible version", () => {
    const raw = JSON.stringify({
      ...BASE_DRAFT,
      version: 99,
      sessionId: "session-1",
      savedAt: "now",
    });
    expect(parseAttendanceDraft(raw, "session-1")).toBeNull();
  });

  it("rejects a draft missing required fields", () => {
    const raw = JSON.stringify({ version: 1, sessionId: "session-1" });
    expect(parseAttendanceDraft(raw, "session-1")).toBeNull();
  });
});
