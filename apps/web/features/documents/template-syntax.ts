/**
 * The placeholder syntax of a document template body, as the API renders it.
 *
 * The API executes a body with Go's html/template against a map of values
 * (apps/api/internal/platform/documents/renderer.go), so a value is written
 * `{{.name}}`: the dot reads `name` from that map. A list is walked with
 * `{{range .name}}...{{end}}`, inside which the dot is one item and
 * `{{.field}}` reads that item's field. A value the map does not hold
 * prints nothing.
 *
 * `{{name}}` without the dot is a call to a function called `name`. The
 * renderer defines none, so the API cannot parse such a body and every
 * document issued from it fails. The first version of the template editor
 * wrote placeholders that way; `findLegacyPlaceholders` finds them in a
 * saved body and `fixLegacyPlaceholders` adds the dot.
 *
 * This is not a Go template parser. It reads the actions (`{{...}}`) well
 * enough to list the values a body uses and to draw a preview, and leaves
 * everything else to the API.
 */

/** The text the editor inserts for one value: `{{.name}}`. */
export function placeholderToken(name: string): string {
  return `{{.${name}}}`;
}

/**
 * The text the editor inserts for a list: one paragraph per item, with
 * each of the item's fields, `{{range .list}}<p>{{.a}} - {{.b}}</p>{{end}}`.
 */
export function listBlockToken(list: string, fields: readonly string[]): string {
  return `{{range .${list}}}<p>${fields.map(placeholderToken).join(" - ")}</p>{{end}}`;
}

// One action. `{{- ` and ` -}}` trim the white space around it; a comment
// may hold `}}`, so it is matched whole before anything else.
const ACTION_PATTERN = /\{\{(-\s)?\s*(\/\*[\s\S]*?\*\/|[\s\S]*?)\s*(\s-)?\}\}/g;

/** Words that open, continue or close a block, or stand for a value. */
const KEYWORDS = new Set([
  "block",
  "break",
  "continue",
  "define",
  "else",
  "end",
  "false",
  "if",
  "nil",
  "range",
  "template",
  "true",
  "with",
]);

/** The functions every Go template has; a bare `{{len}}` is one of these, not a value. */
const BUILTIN_FUNCTIONS = new Set([
  "and",
  "call",
  "eq",
  "ge",
  "gt",
  "html",
  "index",
  "js",
  "le",
  "len",
  "lt",
  "ne",
  "not",
  "or",
  "print",
  "printf",
  "println",
  "slice",
  "urlquery",
]);

const IDENTIFIER = /^[A-Za-z_]\w*$/;
const LEADING_WORD = /^[A-Za-z_]\w*/;
const STRING_LITERAL = /"(?:[^"\\]|\\.)*"|`[^`]*`|'(?:[^'\\]|\\.)*'/g;
// `.name`, `$.name` or `$var.name`, not the second part of `.a.b` nor a
// field of a parenthesised pipeline.
const FIELD_REFERENCE = /(^|[^\w$).\]])(\$\w*)?\.([A-Za-z_]\w*)/g;
// An output action that prints one value, optionally through functions:
// `.name`, `$.name`, `.name | html`.
const VALUE_ACTION = /^(\$?)\.([A-Za-z_]\w*)\s*(?:\|[\s\S]*)?$/;

/** A bare `{{name}}`: a value written without its dot. */
function isLegacyAction(inner: string): boolean {
  return IDENTIFIER.test(inner) && !KEYWORDS.has(inner) && !BUILTIN_FUNCTIONS.has(inner);
}

interface FieldReference {
  name: string;
  /** `$.name`: always the top-level map, whatever the dot is. */
  fromRoot: boolean;
}

function fieldReferences(pipeline: string): FieldReference[] {
  const out: FieldReference[] = [];
  for (const match of pipeline.replaceAll(STRING_LITERAL, '""').matchAll(FIELD_REFERENCE)) {
    const variable = match[2];
    // `$x.name` reads a template variable, not the map.
    if (variable !== undefined && variable !== "$") continue;
    out.push({ name: match[3] ?? "", fromRoot: variable === "$" });
  }
  return out;
}

/** What the dot means inside a block, and whether a preview draws the block. */
interface Frame {
  /** The dot is no longer the top-level map (inside `range`, `with`, `define`). */
  rebinds: boolean;
  /** The top-level list a `range` walks, so its items' fields can be named. */
  list?: string;
  /** A preview leaves this part out: the `else` of a block, or a `define`. */
  skipping: boolean;
}

export type TemplateSegment =
  | { type: "text"; text: string; hidden: boolean }
  /** A printed value; `list` names the list whose item it reads, `null` for a top-level value. */
  | { type: "value"; name: string; list: string | null; hidden: boolean }
  /** A value written without its dot, which the API cannot parse. */
  | { type: "legacy"; raw: string; name: string; hidden: boolean }
  /** Any other action, kept as written. */
  | { type: "other"; raw: string; hidden: boolean };

export interface TemplateScan {
  segments: TemplateSegment[];
  /** Top-level values the body reads, in first-seen order. */
  placeholders: string[];
  /** Values written without their dot, in first-seen order. */
  legacy: string[];
}

/**
 * The top-level list a `range` or `with` walks (after any `$i, $v :=`
 * declaration), when its pipeline is that one value.
 */
function rangedList(pipeline: string, dotIsRoot: boolean): string | undefined {
  const value = pipeline.includes(":=") ? pipeline.slice(pipeline.indexOf(":=") + 2) : pipeline;
  const match = /^(\$?)\.([A-Za-z_]\w*)$/.exec(value.trim());
  return match && (match[1] === "$" || dotIsRoot) ? match[2] : undefined;
}

/** Reads a template body into text, values and other actions, tracking what the dot is. */
export function scanTemplate(body: string): TemplateScan {
  const segments: TemplateSegment[] = [];
  const placeholders = new Set<string>();
  const legacy = new Set<string>();
  const stack: Frame[] = [];
  const hidden = () => stack.some((frame) => frame.skipping);
  const dotIsRoot = () => !stack.some((frame) => frame.rebinds);
  const currentList = () => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const frame = stack[i];
      if (frame?.rebinds) return frame.list ?? "";
    }
    return null;
  };
  const note = (pipeline: string) => {
    for (const ref of fieldReferences(pipeline)) {
      if (ref.fromRoot || dotIsRoot()) placeholders.add(ref.name);
    }
  };
  const openBlock = (pipeline: string, rebinds: boolean) => {
    // The block's own pipeline reads the dot outside the block.
    const list = rebinds ? rangedList(pipeline, dotIsRoot()) : undefined;
    note(pipeline);
    stack.push({ rebinds, list, skipping: false });
  };

  let last = 0;
  for (const match of body.matchAll(ACTION_PATTERN)) {
    if (match.index > last) {
      segments.push({ type: "text", text: body.slice(last, match.index), hidden: hidden() });
    }
    last = match.index + match[0].length;
    const inner = (match[2] ?? "").trim();
    if (inner.startsWith("/*")) continue;
    const word = LEADING_WORD.exec(inner)?.[0] ?? "";
    const rest = inner.slice(word.length).trim();

    switch (word) {
      case "if":
        openBlock(rest, false);
        continue;
      case "range":
      case "with":
      case "block":
        openBlock(rest, true);
        continue;
      case "define":
        stack.push({ rebinds: true, skipping: true });
        continue;
      case "else": {
        const frame = stack.at(-1);
        if (!frame) continue;
        // The else branch runs with the dot of the block's surroundings;
        // a preview draws the first branch only.
        frame.rebinds = false;
        frame.skipping = true;
        const chained = LEADING_WORD.exec(rest)?.[0] ?? "";
        const pipeline = rest.slice(chained.length).trim();
        note(pipeline);
        if (chained === "with") {
          frame.rebinds = true;
          frame.list = undefined;
        }
        continue;
      }
      case "end":
        stack.pop();
        continue;
      case "template":
        note(rest);
        continue;
      case "break":
      case "continue":
        continue;
    }

    if (isLegacyAction(inner)) {
      legacy.add(inner);
      segments.push({ type: "legacy", raw: match[0], name: inner, hidden: hidden() });
      continue;
    }
    const value = VALUE_ACTION.exec(inner);
    const root = value !== null && (value[1] === "$" || dotIsRoot());
    note(inner);
    if (value) {
      segments.push({
        type: "value",
        name: value[2] ?? "",
        list: root ? null : currentList(),
        hidden: hidden(),
      });
    } else {
      segments.push({ type: "other", raw: match[0], hidden: hidden() });
    }
  }
  if (last < body.length) segments.push({ type: "text", text: body.slice(last), hidden: hidden() });

  return { segments, placeholders: [...placeholders], legacy: [...legacy] };
}

/** Top-level values a template body reads, in first-seen order. */
export function extractPlaceholders(body: string): string[] {
  return scanTemplate(body).placeholders;
}

/** Values written without their dot (`{{name}}`), which make the API refuse the body. */
export function findLegacyPlaceholders(body: string): string[] {
  return scanTemplate(body).legacy;
}

/** Rewrites every `{{name}}` as `{{.name}}`, keeping any trim markers. */
export function fixLegacyPlaceholders(body: string): string {
  return body.replaceAll(
    ACTION_PATTERN,
    (whole, trimLeft: string | undefined, inner: string, trimRight: string | undefined) => {
      const name = inner.trim();
      return isLegacyAction(name) ? `{{${trimLeft ?? ""}.${name}${trimRight ?? ""}}}` : whole;
    },
  );
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * The body as a preview: each value becomes its name in square brackets
 * (`[Nama siswa]`, from `label`), a list's block is drawn once, only the
 * first branch of an `if` shows, comments and block markers disappear,
 * and anything else stays as written, a value without its dot included.
 */
export function renderPreviewHtml(
  body: string,
  label: (name: string, list: string | null) => string,
): string {
  let out = "";
  for (const segment of scanTemplate(body).segments) {
    if (segment.hidden) continue;
    switch (segment.type) {
      case "text":
        out += segment.text;
        break;
      case "value":
        out += `[${escapeHtml(label(segment.name, segment.list))}]`;
        break;
      case "legacy":
      case "other":
        out += segment.raw;
        break;
    }
  }
  return out;
}
