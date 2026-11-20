/**
 * Internal field names the import API accepts (openapi/modules/library.yaml
 * `LibraryImportRow`). A row is keyed by these directly, or by whatever
 * source column name the caller's `mapping` points each field at.
 *
 * Kept apart from ./import-lib.ts (which loads the 900 kB+ exceljs library)
 * so that components consuming only these constants, such as
 * components/import-mapping-step.tsx, do not pull exceljs into their chunk.
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

export interface ParsedImportSheet {
  headers: string[];
  /** Data rows keyed by the raw header text found in the uploaded file. */
  rows: Record<string, string>[];
}

/**
 * Header spellings that identify each field, used only to seed a default
 * mapping. This mirrors the aliases in the API's
 * `domain.ImportFieldDefs` (apps/api/internal/modules/library/domain/import.go),
 * which include every header of the library's own import template, so a
 * file made from that template maps without any manual step.
 */
const FIELD_SYNONYMS: Record<ImportField, string[]> = {
  title: ["judul", "judul*", "title", "judul buku"],
  main_author: [
    "pengarang",
    "penulis",
    "penulis utama",
    "author",
    "nama pengarang",
    "pengarang utama",
  ],
  publisher: ["penerbit", "publisher"],
  publish_place: ["tempat terbit", "kota terbit", "place"],
  publish_year: ["tahun", "tahun terbit", "publish year"],
  isbn: ["isbn", "isbn/issn", "no. isbn", "nomor isbn"],
  ddc_number: [
    "ddc",
    "nomor ddc",
    "no. klas",
    "noklas",
    "nomor klasifikasi",
    "klasifikasi",
    "no kelas",
  ],
  subjects: ["subjek", "subject", "tajuk subjek"],
  material_type: ["jenis bahan (kode)", "jenis bahan", "jenis koleksi", "gmd", "jenis materi"],
  category: ["kategori (kode)", "kategori koleksi", "kategori"],
  access: ["akses", "access"],
  location: ["lokasi (kode)", "lokasi ruang", "lokasi", "rak"],
  source: ["sumber (kode)", "sumber pengadaan", "sumber", "asal", "asal perolehan"],
  acquired_on: ["tanggal pengadaan", "tanggal perolehan", "tanggal terima", "tanggal masuk"],
  price: ["harga", "price", "harga satuan"],
  no_induk: ["no. induk", "noinduk", "nomor induk", "no induk"],
  barcode: ["barcode", "nomor barcode", "kode batang"],
  copies: ["jumlah eksemplar", "jumlah", "eksemplar", "copies"],
  call_number: ["nomor panggil", "callnumber", "no. panggil"],
};

/** Case- and punctuation-insensitive form, like the API's NormalizeHeader. */
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
