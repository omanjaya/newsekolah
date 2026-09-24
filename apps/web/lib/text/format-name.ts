/**
 * Renders a name for display in title case, since seeded/imported data
 * often arrives in ALL CAPS. Never used for matching (search, sort, save
 * payloads) -- only this rendered label.
 *
 * Handles the shapes common in Indonesian names without mangling them:
 * - Already mixed-case input is left alone (nothing here re-cases a name
 *   someone typed correctly, e.g. "McKenzie" or "iPhone"-style brands
 *   that occasionally end up in free-text fields).
 * - Initials and abbreviations with dots ("R.A.", "S.Pd.") keep every
 *   letter after a dot capitalised, not just the first.
 * - A single-letter word ("I" as in "I Gede", "I Putu") stays a bare
 *   capital, matching the Balinese naming convention rather than reading
 *   as the English pronoun.
 * - Common Indonesian name particles ("bin", "binti", "van", "der") stay
 *   lowercase when they are not the first word, matching normal title-case
 *   convention for particles.
 */
const LOWERCASE_PARTICLES = new Set(["bin", "binti", "van", "der", "den", "al"]);

function titleCaseWord(word: string, isFirstWord: boolean): string {
  if (word === "") return word;
  // A dotted abbreviation ("R.A.", "S.Pd.", "M.M."): capitalise every
  // letter segment, not just the word's first character.
  if (word.includes(".")) {
    return word
      .split(".")
      .map((segment) =>
        segment ? (segment[0]?.toUpperCase() ?? "") + segment.slice(1).toLowerCase() : segment,
      )
      .join(".");
  }
  const lower = word.toLowerCase();
  if (!isFirstWord && LOWERCASE_PARTICLES.has(lower)) return lower;
  return (word[0]?.toUpperCase() ?? "") + word.slice(1).toLowerCase();
}

/** True when `name` has both an uppercase and a lowercase letter already -- treated as intentional casing, left untouched. */
function isAlreadyMixedCase(name: string): boolean {
  return /[a-z]/.test(name) && /[A-Z]/.test(name);
}

export function formatDisplayName(name: string): string {
  if (!name) return name;
  if (isAlreadyMixedCase(name)) return name;
  return name
    .split(" ")
    .map((word, index) => titleCaseWord(word, index === 0))
    .join(" ");
}
