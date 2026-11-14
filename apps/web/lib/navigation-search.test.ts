import { describe, expect, it } from "vitest";

import { normalizeSearch, rankSearch, scoreSearch } from "./navigation-search";

const pages = [
  { label: "Beranda" },
  { label: "Perlu tindakan" },
  { label: "Pindai" },
  { label: "Laporan", keywords: ["Laporan presensi", "Rekap kunjungan"] },
  { label: "Presensi dan jurnal", keywords: ["Presensi", "Jurnal", "Rekap presensi"] },
  { label: "Kegiatan siswa", keywords: ["Ekstrakurikuler", "Prestasi"] },
  { label: "Prestasi" },
  { label: "Catat pelanggaran" },
];

const rank = (query: string) => rankSearch(query, pages, (page) => page).map((r) => r.entry.label);

describe("command palette ranking", () => {
  it("never matches on letters scattered through a word, a heading or an id", () => {
    // `pre` used to match Catat pelanggaran, Pindai and Laporan as a subsequence.
    expect(rank("pre")).not.toContain("Catat pelanggaran");
    expect(rank("pre")).not.toContain("Pindai");
  });

  it("puts a label that starts with the query first, in menu order", () => {
    expect(rank("pre").slice(0, 2)).toEqual(["Presensi dan jurnal", "Prestasi"]);
  });

  it("ranks a word inside the label above a keyword match", () => {
    expect(rank("jurnal")[0]).toBe("Presensi dan jurnal");
    expect(scoreSearch("jur", "Presensi dan jurnal")).toBeGreaterThan(
      scoreSearch("jur", "Laporan", ["Jurnal"]),
    );
  });

  it("finds a page by a keyword when its label does not match", () => {
    expect(rank("ekstra")).toEqual(["Kegiatan siswa"]);
  });

  it("matches every word of a multi-word query against word starts", () => {
    expect(rank("pres jur")[0]).toBe("Presensi dan jurnal");
    expect(rank("tind per")).toEqual(["Perlu tindakan"]);
  });

  it("ignores case, accents and punctuation", () => {
    expect(normalizeSearch("  Présensi & Jurnal ")).toBe("presensi jurnal");
    expect(rank("BERANDA")).toEqual(["Beranda"]);
  });

  it("returns nothing for an empty query", () => {
    expect(rank("   ")).toEqual([]);
  });
});
