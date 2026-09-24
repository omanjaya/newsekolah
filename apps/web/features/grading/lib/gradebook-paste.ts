/**
 * Parses text pasted into a score cell into a grid of rows/columns, the
 * shape Excel (and Sheets) put on the clipboard for a copied range: rows
 * separated by a newline, columns within a row separated by a tab. A
 * single copied cell (or column) has no tab, so callers can tell "one
 * value, let the input's own paste behaviour handle it" apart from "a
 * block, take over placement" by checking `rows.length > 1 ||
 * rows[0].length > 1`.
 *
 * Trailing empty lines (Excel's copy of a column ends the clipboard text
 * with a newline) are dropped so they don't paste an extra blank row past
 * the real data.
 */
export function parsePastedGrid(text: string): string[][] {
  const withoutTrailingNewline = text.replace(/\r?\n$/, "");
  if (withoutTrailingNewline === "") return [[""]];
  return withoutTrailingNewline.split(/\r?\n/).map((line) => line.split("\t"));
}

/** True when a parsed grid is more than a single cell, i.e. worth intercepting the default paste. */
export function isMultiCellPaste(rows: string[][]): boolean {
  return rows.length > 1 || (rows[0]?.length ?? 0) > 1;
}
