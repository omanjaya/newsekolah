/**
 * Formatting for the document template body, a plain HTML source with Go
 * template actions. A school admin picks text and a format; the selection
 * is wrapped in the matching tags, so nobody has to type HTML for a bold
 * word or a centred heading. Pure string work: the editor applies the
 * result to its textarea and restores the selection.
 */

export type TemplateFormat =
  | "heading"
  | "paragraph"
  | "center"
  | "bold"
  | "italic"
  | "underline"
  | "bulletList"
  | "numberedList"
  | "lineBreak";

export interface FormatResult {
  body: string;
  /** The new selection: the formatted text, or the cursor inside an empty wrap. */
  selectionStart: number;
  selectionEnd: number;
}

/** Inline tags wrap the selection as it is. */
const INLINE: Partial<Record<TemplateFormat, [string, string]>> = {
  bold: ["<strong>", "</strong>"],
  italic: ["<em>", "</em>"],
  underline: ["<u>", "</u>"],
};

/** Block tags wrap the selection on lines of their own. */
const BLOCK: Partial<Record<TemplateFormat, [string, string]>> = {
  heading: ['<h2 style="text-align:center;">', "</h2>"],
  paragraph: ["<p>", "</p>"],
  center: ['<p style="text-align:center;">', "</p>"],
};

const LIST: Partial<Record<TemplateFormat, string>> = {
  bulletList: "ul",
  numberedList: "ol",
};

/** Lines of the selection without blank ones, each trimmed. */
function itemsOf(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/**
 * Applies `format` to `body` between `start` and `end`. With nothing
 * selected, inline and block formats insert an empty pair and leave the
 * cursor between the tags; a list starts with one empty item. A block
 * starts on a line of its own, so the source stays readable.
 */
export function applyTemplateFormat(
  body: string,
  start: number,
  end: number,
  format: TemplateFormat,
): FormatResult {
  const from = Math.max(0, Math.min(start, end, body.length));
  const to = Math.min(body.length, Math.max(start, end));
  const before = body.slice(0, from);
  const selected = body.slice(from, to);
  const after = body.slice(to);

  const replace = (text: string, selectFrom: number, selectTo: number): FormatResult => ({
    body: before + text + after,
    selectionStart: from + selectFrom,
    selectionEnd: from + selectTo,
  });

  if (format === "lineBreak") {
    return replace(`${selected}<br>\n`, selected.length + 5, selected.length + 5);
  }

  const inline = INLINE[format];
  if (inline) {
    const [open, close] = inline;
    return replace(open + selected + close, open.length, open.length + selected.length);
  }

  // A block or a list begins on a new line unless it already does.
  const lead = before === "" || before.endsWith("\n") ? "" : "\n";
  const trail = after === "" || after.startsWith("\n") ? "" : "\n";

  const block = BLOCK[format];
  if (block) {
    const [open, close] = block;
    const text = selected.trim();
    const offset = lead.length + open.length;
    return replace(lead + open + text + close + trail, offset, offset + text.length);
  }

  const list = LIST[format];
  if (list) {
    const items = itemsOf(selected);
    const lines = (items.length > 0 ? items : [""]).map((item) => `  <li>${item}</li>`);
    const text = `<${list}>\n${lines.join("\n")}\n</${list}>`;
    // The cursor lands in the first item, or the items stay selected.
    const firstItem = lead.length + `<${list}>\n  <li>`.length;
    return items.length > 0
      ? replace(lead + text + trail, lead.length, lead.length + text.length)
      : replace(lead + text + trail, firstItem, firstItem);
  }

  return { body, selectionStart: start, selectionEnd: end };
}

/** The format a keyboard shortcut asks for (Ctrl or Cmd with B, I, U), if any. */
export function shortcutFormat(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): TemplateFormat | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return null;
  switch (event.key.toLowerCase()) {
    case "b":
      return "bold";
    case "i":
      return "italic";
    case "u":
      return "underline";
    default:
      return null;
  }
}
