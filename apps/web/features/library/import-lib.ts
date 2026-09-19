import type { ParsedImportSheet } from "./import-fields";

/**
 * ExcelJS hands back a plain value for most cells, but a formula cell arrives
 * as `{ formula, result }`, a linked cell as `{ text, hyperlink }`, and a cell
 * with mixed formatting as `{ richText }`. Flatten all of them to the plain
 * text the import API expects.
 */
function cellToString(cell: unknown): string {
  if (cell === undefined || cell === null) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean") {
    return String(cell);
  }
  if (typeof cell === "object") {
    const value = cell as { text?: unknown; richText?: unknown; result?: unknown };
    if (typeof value.text === "string") return value.text;
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => cellToString((part as { text?: unknown }).text)).join("");
    }
    if ("result" in value) return cellToString(value.result);
  }
  return "";
}

/**
 * Reads the first non-"Referensi" sheet of an uploaded workbook (the
 * template's hidden Referensi sheet only carries dropdown reference codes,
 * per the template's own description) as a header row plus data rows.
 *
 * exceljs is a 900 kB+ dependency, so it is loaded here rather than at
 * module scope: only the screen that actually parses a file pays for it,
 * and IMPORT_FIELDS/guessImportMapping/buildImportPayload consumers (see
 * ./import-fields.ts) never pull it in.
 */
export async function parseImportFile(file: File): Promise<ParsedImportSheet> {
  // The explicit chunk name is what next.config.ts's Serwist `exclude`
  // matches to keep this ~900 kB chunk out of the precache manifest.
  const { default: ExcelJS } = await import(/* webpackChunkName: "exceljs" */ "exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet =
    workbook.worksheets.find((worksheet) => worksheet.name.trim().toLowerCase() !== "referensi") ??
    workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  // row.values is 1-based with an unused slot 0, so drop it to get column order.
  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    grid.push(values.map((cell) => cellToString(cell).trim()));
  });

  const [headerRow, ...dataRows] = grid;
  // Keep the blank header cells in place while building each record: dropping
  // them first would shift every later column one position to the left.
  const headerCells = headerRow ?? [];
  const headers = headerCells.filter(Boolean);
  const rows = dataRows
    .filter((row) => row.some((cell) => cell !== ""))
    .map((row) => {
      const record: Record<string, string> = {};
      headerCells.forEach((header, index) => {
        if (header) record[header] = row[index] ?? "";
      });
      return record;
    });
  return { headers, rows };
}
