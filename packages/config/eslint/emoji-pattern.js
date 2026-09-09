// Unicode ranges that cover pictographic emoji (not plain punctuation or CJK).
// Used by no-restricted-syntax selectors to reject emoji literals in code, per
// CLAUDE.md ("Tidak ada emoji di UI, kode, komentar, commit, dokumen").
export const EMOJI_RANGES =
  "\\u{2600}-\\u{27BF}" + // misc symbols, dingbats (includes checkmarks, stars)
  "\\u{1F300}-\\u{1FAFF}" + // misc pictographs through symbols-and-pictographs extended-A
  "\\u{1F1E6}-\\u{1F1FF}" + // regional indicator (flag emoji)
  "\\u{2B00}-\\u{2BFF}" + // additional arrows/stars used decoratively as emoji
  "\\u{FE0F}" + // variation selector-16 (emoji presentation)
  "\\u{200D}"; // zero-width joiner (emoji sequences)

export const EMOJI_SOURCE = `[${EMOJI_RANGES}]`;

/**
 * Builds a no-restricted-syntax entry matching an AST selector whose string
 * value contains an emoji codepoint.
 */
export function emojiSelector(selector) {
  return {
    selector: `${selector}[value=/${EMOJI_SOURCE}/u]`,
    message: "Emoji is not allowed in code, comments, or UI text. Use a Lucide icon instead.",
  };
}
