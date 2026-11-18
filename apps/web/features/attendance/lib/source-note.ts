// The notes the API writes on a row it fills in from a permit
// (apps/api/internal/modules/permits/service: "leave letter <number>",
// "exit permit", "exit permit (recorded by duty teacher)").
const LEAVE_LETTER_NOTE = /^leave letter\s+(\S.*)$/;
const EXIT_PERMIT_NOTE = /^exit permit\b/;

/**
 * The note to show on an attendance row. A row filled in from a leave
 * letter or an exit permit carries the API's English machine note, which
 * the web never prints as is: a leave letter's note becomes its number in
 * the reader's language ("Surat izin 21/IZIN/XI/2026"), and an exit
 * permit's note is dropped, since the row's source label already says
 * where the status came from. Any other note, a teacher's own included, is
 * returned unchanged; "" means there is nothing to show.
 */
export function sourceNoteText(
  note: string | null | undefined,
  source: string | null | undefined,
  leaveLetter: (number: string) => string,
): string {
  const raw = note ?? "";
  const text = raw.trim();
  if (source === "leave") {
    const number = LEAVE_LETTER_NOTE.exec(text)?.[1]?.trim();
    if (number) return leaveLetter(number);
  }
  if (source === "permit" && EXIT_PERMIT_NOTE.test(text)) return "";
  return raw;
}
