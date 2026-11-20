import { describe, expect, it } from "vitest";

import { IMPORT_FIELDS, guessImportMapping } from "./import-fields";

/**
 * The header row of the library's own import template, in order
 * (apps/api/internal/modules/library/service/import_template.go,
 * importTemplateHeaders). Keep the two in step: a header the guesser misses
 * here means every row of a filled-in template fails on the server.
 */
const TEMPLATE_HEADERS = [
  "Judul*",
  "Pengarang",
  "Penerbit",
  "Tempat Terbit",
  "Tahun",
  "ISBN",
  "DDC",
  "Subjek",
  "Jenis Bahan (kode)",
  "Kategori (kode)",
  "Akses",
  "Lokasi (kode)",
  "Sumber (kode)",
  "Tanggal Pengadaan",
  "Harga",
  "No. Induk",
  "Barcode",
  "Jumlah Eksemplar",
];

describe("guessImportMapping", () => {
  // The coded columns ("Jenis Bahan (kode)" and friends) and "Tanggal
  // Pengadaan" were left unmapped, so every row of the template failed
  // with "Jenis bahan (kode) tidak dikenali".
  it("maps every column of the library's own template", () => {
    const mapping = guessImportMapping(TEMPLATE_HEADERS);
    expect(mapping).toEqual({
      title: "Judul*",
      main_author: "Pengarang",
      publisher: "Penerbit",
      publish_place: "Tempat Terbit",
      publish_year: "Tahun",
      isbn: "ISBN",
      ddc_number: "DDC",
      subjects: "Subjek",
      material_type: "Jenis Bahan (kode)",
      category: "Kategori (kode)",
      access: "Akses",
      location: "Lokasi (kode)",
      source: "Sumber (kode)",
      acquired_on: "Tanggal Pengadaan",
      price: "Harga",
      no_induk: "No. Induk",
      barcode: "Barcode",
      copies: "Jumlah Eksemplar",
    });
    // Only the call number has no template column: it is generated.
    expect(IMPORT_FIELDS.filter((field) => !(field in mapping))).toEqual(["call_number"]);
  });

  it("still recognises other common spellings", () => {
    expect(
      guessImportMapping(["Jenis Koleksi", "Kategori Koleksi", "Tanggal Perolehan", "Rak"]),
    ).toEqual({
      material_type: "Jenis Koleksi",
      category: "Kategori Koleksi",
      acquired_on: "Tanggal Perolehan",
      location: "Rak",
    });
  });
});
