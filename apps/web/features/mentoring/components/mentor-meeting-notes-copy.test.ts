import { describe, expect, it } from "vitest";

import en from "../../../messages/features/mentoring.en.json";
import id from "../../../messages/features/mentoring.id.json";

/*
 * Who may read a meeting note's content: its author, a holder of the
 * counselor duty and a holder of the leadership duty (Wakil Kepala
 * Sekolah), domain.MeetingNote.VisibleTo. The principal role reads none
 * (it lacks manage_mentoring), so the withheld-notes copy an admin reads
 * must not send them to "pimpinan sekolah", which includes the principal.
 */
describe("withheld meeting notes copy", () => {
  it.each([
    ["id", id.notes.withheldBody, id.notes.withheldNotice, "wakil kepala sekolah", "pimpinan"],
    ["en", en.notes.withheldBody, en.notes.withheldNotice, "vice principal", "leadership"],
  ])("names the readers the API allows (%s)", (_locale, body, notice, reader, overPromise) => {
    for (const text of [body, notice]) {
      expect(text.toLowerCase()).toContain(reader);
      expect(text.toLowerCase()).not.toContain(overPromise);
    }
  });
});
