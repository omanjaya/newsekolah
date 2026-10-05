/**
 * Plain-text preview of an announcement's sanitised `body_html`, for the
 * reader's bento card (docs/07-ui-ux.md). Only strips tags and decodes the
 * handful of entities `AnnouncementForm.textToHtml` can produce -- it does
 * not need to be a full HTML parser, since the source is already this
 * app's own sanitised output, not arbitrary markup.
 */
export function htmlToExcerpt(html: string, maxLength = 160): string {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}
