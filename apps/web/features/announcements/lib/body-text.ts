/**
 * The announcement editor is a plain textarea: a blank line starts a new
 * paragraph and a single newline breaks the line. These two functions turn
 * that text into the `body_html` the API stores and back, so opening a
 * saved announcement shows the same paragraphs and lines it was written
 * with, and saving it unchanged gives back the same HTML.
 */

/** Plain text from the editor becomes one paragraph per blank-line block. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p>${block
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

const ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#34;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

/**
 * The editor text for a stored `body_html`: the reverse of `textToHtml`.
 * Paragraphs (and other blocks) are separated by a blank line, a `<br>` is
 * a newline, other tags are dropped and the entities the server's
 * sanitiser writes are decoded. The source is that sanitised output, not
 * arbitrary markup, so a few patterns cover it.
 */
export function htmlToText(html: string): string {
  return (
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|blockquote|pre)\s*>/gi, "\n\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&(lt|gt|quot|nbsp|#34|#39);/g, (entity) => ENTITIES[entity] ?? entity)
      // Last, so "&amp;lt;" (a typed "&lt;") stays the literal text "&lt;".
      .replace(/&amp;/g, "&")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
