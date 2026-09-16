import * as XLSX from "xlsx";

/**
 * Internal field names the import API accepts (openapi/modules/library.yaml
 * `LibraryImportRow`). A row is keyed by these directly, or by whatever
 * source column name the caller's `mapping` points each field at.
 */
export const IMPORT_FIELDS = [
  "title",
  "main_author",
  "publisher",
  "publish_place",
  "publish_year",
  "isbn",
  "ddc_number",
  "subjects",
  "material_type",
  "category",
  "access",
  "location",
  "source",
  "acquired_on",
  "price",
  "no_induk",
  "barcode",
  "copies",
  "call_number",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

/** A cell from `sheet_to_json` is a string, number, boolean, Date, or empty. */
function cellToString(cell: unknown): string {
  if (cell === undefined || cell === null) return "";
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean") {
    return String(cell);
  }
  return "";
}

export interface ParsedImportSheet {
  headers: string[];
  /** Data rows keyed by the raw header text found in the uploaded file. */
  rows: Record<string, string>[];
}

/**
 * Reads the first non-"Referensi" sheet of an uploaded workbook (the
 * template's hidden Referensi sheet only carries dropdown reference codes,
 * per the template's own description) as a header row plus data rows.
 */
export async function parseImportFile(file: File): Promise<ParsedImportSheet> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName =
    workbook.SheetNames.find((name) => name.trim().toLowerCase() !== "referensi") ??
    workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { headers: [], rows: [] };
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const [headerRow, ...dataRows] = grid;
  const headers = (headerRow ?? []).map((cell) => cellToString(cell).trim()).filter(Boolean);
  const rows = dataRows
    .filter((row) => row.some((cell) => cellToString(cell).trim() !== ""))
    .map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = cellToString(row[index]);
      });
      return record;
    });
  return { headers, rows };
}

/** Plausible Indonesian header labels for each field, used only to seed a default mapping. */
const FIELD_SYNONYMS: Record<ImportField, string[]> = {
  title: ["judul"],
  main_author: ["penulis", "penulis utama", "pengarang"],
  publisher: ["penerbit"],
  publish_place: ["kota terbit", "tempat terbit"],
  publish_year: ["tahun terbit", "tahun"],
  isbn: ["isbn"],
  ddc_number: ["nomor ddc", "ddc", "klasifikasi"],
  subjects: ["subjek"],
  material_type: ["jenis bahan", "jenis koleksi"],
  category: ["kategori"],
  access: ["akses"],
  location: ["lokasi", "rak"],
  source: ["sumber", "asal perolehan"],
  acquired_on: ["tanggal perolehan", "tanggal masuk"],
  price: ["harga"],
  no_induk: ["nomor induk", "no induk"],
  barcode: ["barcode", "kode batang"],
  copies: ["eksemplar", "jumlah eksemplar", "jumlah"],
  call_number: ["nomor panggil"],
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Best-effort default mapping from detected headers; the user can still edit it. */
export function guessImportMapping(headers: string[]): Partial<Record<ImportField, string>> {
  const mapping: Partial<Record<ImportField, string>> = {};
  for (const field of IMPORT_FIELDS) {
    const candidates = [field, ...FIELD_SYNONYMS[field]].map(normalize);
    const match = headers.find((header) => candidates.includes(normalize(header)));
    if (match) mapping[field] = match;
  }
  return mapping;
}

export interface ImportRowPayload {
  row_number: number;
  [column: string]: string | number;
}

/** Builds the API payload: raw rows plus a 1-based row_number, and the confirmed mapping. */
export function buildImportPayload(
  rows: Record<string, string>[],
  mapping: Partial<Record<ImportField, string>>,
): { rows: ImportRowPayload[]; mapping: Record<string, string> } {
  const payloadRows = rows.map((row, index) => ({ ...row, row_number: index + 1 }));
  const cleanMapping: Record<string, string> = {};
  for (const [field, header] of Object.entries(mapping)) {
    if (header) cleanMapping[field] = header;
  }
  return { rows: payloadRows, mapping: cleanMapping };
}
