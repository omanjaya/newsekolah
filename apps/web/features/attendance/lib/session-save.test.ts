import { describe, expect, it } from "vitest";

import type { SessionDetail } from "../api";

import { isWindowClosedCode, saveEntriesBody } from "./session-save";

const roster = [
  { student_user_id: "s1", name: "Siswa Satu" },
  { student_user_id: "s2", name: "Siswa Dua", blocked: true },
  { student_user_id: "s3", name: "Siswa Tiga" },
] as SessionDetail["roster"];

describe("saveEntriesBody", () => {
  it("sends every unblocked row in normal mode, with notes and violations only when set", () => {
    const body = saveEntriesBody({
      roster,
      statuses: { s1: "S" },
      notes: { s1: "demam", s3: "" },
      violations: { s3: ["v1"] },
      defaultCode: "H",
      reason: null,
      journal: null,
    });

    expect(body).toEqual({
      mode: "normal",
      entries: [
        { student_user_id: "s1", status_code: "S", notes: "demam" },
        { student_user_id: "s3", status_code: "H", violation_ids: ["v1"] },
      ],
    });
  });

  it("adds the trimmed reason in correction mode and a complete journal", () => {
    const body = saveEntriesBody({
      roster: [],
      statuses: {},
      notes: {},
      violations: {},
      defaultCode: "H",
      reason: "  salah tekan ",
      journal: { topic: " Persamaan ", activities: "Latihan", reflection: " " },
    });

    expect(body).toEqual({
      mode: "correction",
      reason: "salah tekan",
      entries: [],
      journal: { topic: "Persamaan", activities: "Latihan" },
    });
  });
});

describe("isWindowClosedCode", () => {
  it("knows the two refusals a retry cannot change", () => {
    expect(isWindowClosedCode("ATTENDANCE_WINDOW_CLOSED")).toBe(true);
    expect(isWindowClosedCode("ATTENDANCE_CORRECTION_WINDOW_CLOSED")).toBe(true);
    expect(isWindowClosedCode("ATTENDANCE_NO_ACCESS")).toBe(false);
  });
});
