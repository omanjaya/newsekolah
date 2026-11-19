import { describe, expect, it } from "vitest";

import "../../messages/features";

import { getMessages } from "./get-messages";

/**
 * One voice in the copy (docs/07-ui-ux.md section 0): labels in sentence
 * case, "dan" (and) instead of "&". Every string of the merged catalogs
 * (the shared @newsekolah/i18n one, apps/web's own and every feature
 * catalog) is checked, in both languages.
 *
 * Title Case is caught as two capitalised words in a row ("Data Sekolah",
 * "Rekap Buku Tamu"). A single capital after a lowercase word is allowed,
 * because copy names a screen or a button by its own label ("di halaman
 * Izin keluar", "pilih Pindai"); so is anything inside quotation marks.
 */

/**
 * Phrases that keep their capitals, each with the reason it may. Checked
 * before the word list, so the words inside them need no entry of their own.
 */
const PROPER_PHRASES = [
  // Product names of Meta's WhatsApp platform, as Meta writes them.
  "WhatsApp Business Manager",
  "Meta Cloud API",
  // Product name of Google's school suite.
  "Google Workspace",
  // The OAuth field name the identity provider's console shows.
  "Client ID",
  // The key printed on the keyboard.
  "Caps Lock",
  // The name of the national curriculum.
  "Kurikulum Merdeka",
  // The column of the e-Rapor workbook, quoted as the document names it.
  "Nilai Rapor",
];

/** Single words that keep their capital wherever they stand, grouped by reason. */
const PROPER_WORDS = new Set([
  // The polite "you" of Indonesian is always capitalised.
  "Anda",
  // Time zone names (Asia/Jakarta, Asia/Makassar, Asia/Jayapura).
  "Asia",
  "Jakarta",
  "Makassar",
  "Jayapura",
  // Products and services named as their makers write them.
  "Google",
  "Telegram",
  "BotFather",
  "Dapodik",
  // The phone system a session's app runs on ("Aplikasi Android").
  "Android",
  // Microsoft's spreadsheet and word processor, named for the file a download makes.
  "Excel",
  "Word",
  // Keys printed on the keyboard.
  "Ctrl",
  "Cmd",
  "Shift",
  "Alt",
  "Enter",
  "Esc",
  // The currency symbol.
  "Rp",
  // Day and month names are proper nouns in both languages.
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
  "Minggu",
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
  "January",
  "February",
  "March",
  "May",
  "June",
  "July",
  "August",
  "October",
  "December",
  // Country and language names.
  "Indonesia",
  "English",
  "Inggris",
  // Religions, as the student record lists them.
  "Islam",
  "Kristen",
  "Katolik",
  "Hindu",
  "Buddha",
  "Konghucu",
]);

/**
 * Text that names a document rather than the interface: the default title
 * and the column headers of an exported file stay as the document writes
 * them (an object holding `defaultTitle`, or any key about export).
 */
function isDocumentText(path: readonly string[], parents: readonly unknown[]): boolean {
  if (path.some((segment) => /export/i.test(segment))) return true;
  return parents.some(
    (parent) => typeof parent === "object" && parent !== null && "defaultTitle" in parent,
  );
}

interface Leaf {
  key: string;
  value: string;
  document: boolean;
}

function collectLeaves(value: unknown, path: string[], parents: unknown[], out: Leaf[]): void {
  if (typeof value === "string") {
    out.push({ key: path.join("."), value, document: isDocumentText(path, parents) });
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    collectLeaves(child, [...path, key], [...parents, value], out);
  }
}

function leavesOf(locale: "id" | "en"): Leaf[] {
  const leaves: Leaf[] = [];
  collectLeaves(getMessages(locale), [], [], leaves);
  return leaves;
}

function isAllowedWord(word: string): boolean {
  if (PROPER_WORDS.has(word)) return true;
  // Acronyms and Roman numerals (NIS, QR, BK, XII) and single letters.
  if (/^[A-Z0-9]+$/.test(word)) return true;
  // Mixed-case names such as WhatsApp, PPKn or iOS.
  return /[A-Z]/.test(word.slice(1));
}

function isCapitalised(word: string): boolean {
  return /^\p{Lu}/u.test(word);
}

/** The runs of two capitalised words in a row, e.g. "Data Sekolah". */
function titleCaseRuns(text: string): string[] {
  let rest = text;
  for (const phrase of PROPER_PHRASES) rest = rest.split(phrase).join(" ");
  rest = rest
    // ICU arguments, with one level of nested plural or select branches.
    .replace(/\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, " ")
    .replace(/<[^>]+>/g, " ")
    // A quoted name is cited as written.
    .replace(/“[^”]*”|"[^"]*"/g, " ");
  const runs: string[] = [];
  // A new sentence, a clause after a colon, a path step or an alternative starts afresh.
  for (const segment of rest.split(/[.!?:;]\s+|\s[–—>-]\s|[/()·|\n]/)) {
    const words = segment.match(/\p{L}[\p{L}'’-]*/gu) ?? [];
    for (let index = 1; index < words.length; index += 1) {
      const previous = words[index - 1] ?? "";
      const word = words[index] ?? "";
      if (
        isCapitalised(word) &&
        !isAllowedWord(word) &&
        isCapitalised(previous) &&
        !isAllowedWord(previous)
      ) {
        runs.push(`${previous} ${word}`);
      }
    }
  }
  return runs;
}

describe("titleCaseRuns", () => {
  it("finds Title Case and leaves sentence case alone", () => {
    expect(titleCaseRuns("Data Sekolah")).toEqual(["Data Sekolah"]);
    expect(titleCaseRuns("Rekap Buku Tamu")).toEqual(["Rekap Buku", "Buku Tamu"]);
    expect(titleCaseRuns("Data sekolah")).toEqual([]);
    expect(titleCaseRuns("Persetujuan ada di halaman Izin keluar, tab Setujui.")).toEqual([]);
  });

  it("allows proper nouns, acronyms, quoted names and new sentences", () => {
    expect(titleCaseRuns("Domain Google Workspace")).toEqual([]);
    expect(titleCaseRuns("Konseling BK")).toEqual([]);
    expect(titleCaseRuns("Kolom “Judul Buku” wajib diisi.")).toEqual([]);
    expect(titleCaseRuns("Tersimpan. Buka lagi nanti.")).toEqual([]);
    expect(titleCaseRuns("Data sekolah > Pembagian tugas")).toEqual([]);
    expect(titleCaseRuns("{count} Siswa")).toEqual([]);
  });
});

describe.each(["id", "en"] as const)("%s catalog voice", (locale) => {
  const leaves = leavesOf(locale);

  it("joins words with 'dan' (and), never '&'", () => {
    const offenders = leaves.filter(({ value }) => value.includes("&")).map(({ key }) => key);
    expect(offenders).toEqual([]);
  });

  it("writes labels in sentence case, keeping proper nouns", () => {
    const offenders = leaves
      .filter(({ key, document }) => !document && !/placeholder$/i.test(key))
      .filter(({ key }) => !key.endsWith(".searchSynonyms"))
      .flatMap(({ key, value }) => {
        const runs = titleCaseRuns(value);
        return runs.length > 0 ? [`${key}: ${runs.join(", ")}`] : [];
      });
    expect(offenders).toEqual([]);
  });
});

describe("id catalog vocabulary", () => {
  const leaves = leavesOf("id").filter(({ key }) => !key.endsWith(".searchSynonyms"));

  it("says Presensi, never absensi, for attendance", () => {
    const offenders = leaves
      .filter(({ value }) => /\babsensi\b/i.test(value))
      .map(({ key }) => key);
    expect(offenders).toEqual([]);
  });

  it("says templat, masuk and bawaan instead of template, login and default", () => {
    const offenders = leaves
      .filter(({ value }) => /\b(template|login|default)\b/i.test(value))
      .map(({ key }) => key);
    expect(offenders).toEqual([]);
  });

  it("spells the unexcused absence Alpha, as the attendance statuses do, never alpa", () => {
    const offenders = leaves.filter(({ value }) => /\balpa\b/i.test(value)).map(({ key }) => key);
    expect(offenders).toEqual([]);
  });
});
