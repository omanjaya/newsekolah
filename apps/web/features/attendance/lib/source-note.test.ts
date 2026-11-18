import { describe, expect, it } from "vitest";

import { sourceNoteText } from "./source-note";

const leaveLetter = (number: string) => `Surat izin ${number}`;

describe("sourceNoteText", () => {
  it("turns the API's leave letter note into the localized phrase with its number", () => {
    expect(sourceNoteText("leave letter 21/IZIN/XI/2026", "leave", leaveLetter)).toBe(
      "Surat izin 21/IZIN/XI/2026",
    );
  });

  it("drops the API's exit permit note, which the source label already explains", () => {
    expect(sourceNoteText("exit permit", "permit", leaveLetter)).toBe("");
    expect(sourceNoteText("exit permit (recorded by duty teacher)", "permit", leaveLetter)).toBe(
      "",
    );
  });

  it("keeps a note that does not match the known prefix as it is", () => {
    expect(sourceNoteText("Dijemput orang tua", "leave", leaveLetter)).toBe("Dijemput orang tua");
    expect(sourceNoteText("leave letter", "leave", leaveLetter)).toBe("leave letter");
    expect(sourceNoteText("Ke dokter gigi", "permit", leaveLetter)).toBe("Ke dokter gigi");
  });

  it("leaves a teacher's note alone even when it reads like a machine note", () => {
    expect(sourceNoteText("leave letter 5/IZIN/XI/2026", "teacher", leaveLetter)).toBe(
      "leave letter 5/IZIN/XI/2026",
    );
    expect(sourceNoteText("exit permit", undefined, leaveLetter)).toBe("exit permit");
  });

  it("returns an empty string for a missing note", () => {
    expect(sourceNoteText(null, "leave", leaveLetter)).toBe("");
    expect(sourceNoteText(undefined, "teacher", leaveLetter)).toBe("");
  });
});
