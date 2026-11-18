/**
 * Ranking for the command palette (docs/superpowers/specs/2026-11-14-ui-overhaul-design.md
 * section 6): a page is found by its own translated label first, by what
 * its label's words start with next, and by its translated keywords after
 * that. The group heading and the registry id never take part, so "pre"
 * finds Presensi, not every entry whose English slug happens to hold a p,
 * an r and an e. Scores only order entries; 0 means "not a match".
 */

/** Exact label. */
const EXACT = 100;
/** The label starts with the query ("pre" in "Presensi dan jurnal"). */
const LABEL_PREFIX = 90;
/** A later word of the label starts with the query ("jur" in "Presensi dan jurnal"). */
const LABEL_WORD = 75;
/** Every word of a multi-word query starts a word of the label, in any order. */
const LABEL_WORDS = 70;
/** A keyword (a member page's own label, a synonym) starts with the query. */
const KEYWORD_PREFIX = 50;
/** A later word of a keyword starts with the query. */
const KEYWORD_WORD = 40;
/** Every word of the query starts a word somewhere in the label or the keywords. */
const MIXED_WORDS = 35;
/** The query sits inside a word of the label ("sensi" in "Presensi"). */
const LABEL_INFIX = 20;
/** The query sits inside a keyword. */
const KEYWORD_INFIX = 10;

/** Lowercase, accents folded, spacing and punctuation collapsed to single spaces. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function words(text: string): string[] {
  return text.split(" ").filter(Boolean);
}

function wordStarts(text: string, query: string): boolean {
  return words(text).some((word) => word.startsWith(query));
}

/**
 * How well `query` matches an entry with `label` and `keywords`; higher
 * is better and 0 hides the entry.
 */
export function scoreSearch(
  query: string,
  label: string,
  keywords: readonly string[] = [],
): number {
  const q = normalizeSearch(query);
  if (!q) return 0;
  const name = normalizeSearch(label);
  const terms = keywords.map(normalizeSearch).filter(Boolean);

  if (name === q) return EXACT;
  if (name.startsWith(q)) return LABEL_PREFIX;
  if (wordStarts(name, q)) return LABEL_WORD;

  const parts = words(q);
  if (parts.length > 1 && parts.every((part) => wordStarts(name, part))) return LABEL_WORDS;
  if (terms.some((term) => term.startsWith(q))) return KEYWORD_PREFIX;
  if (terms.some((term) => wordStarts(term, q))) return KEYWORD_WORD;
  if (
    parts.length > 1 &&
    parts.every((part) => wordStarts(name, part) || terms.some((term) => wordStarts(term, part)))
  ) {
    return MIXED_WORDS;
  }
  if (name.includes(q)) return LABEL_INFIX;
  if (terms.some((term) => term.includes(q))) return KEYWORD_INFIX;
  return 0;
}

export interface Ranked<T> {
  entry: T;
  score: number;
}

/**
 * The matching entries, best first. Ties keep the order they were given
 * in: the menu's own order, which puts daily work first (docs/17), so
 * "pre" lists Presensi dan jurnal before Prestasi.
 */
export function rankSearch<T>(
  query: string,
  entries: readonly T[],
  describe: (entry: T) => { label: string; keywords?: readonly string[] },
): Ranked<T>[] {
  return entries
    .map((entry, index) => {
      const { label, keywords } = describe(entry);
      return { entry, score: scoreSearch(query, label, keywords), index };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ entry, score }) => ({ entry, score }));
}
