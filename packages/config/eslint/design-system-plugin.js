// @newsekolah/config/eslint/design-system
// The design system's own lint rules, one rule per habit it replaces, so a
// package can switch each on (or keep one as a ratchet on a single file)
// without touching the others. The class-name rules read string literals
// and template text, the same technique as ./design-system-patterns.js;
// the element rules read JSX. See docs/07-ui-ux.md section 0.
import {
  ARBITRARY_FONT_SIZE_SOURCE,
  FOCUS_OUTLINE_STYLE_SOURCE,
  HIDDEN_FOCUS_OUTLINE_SOURCE,
  PANEL_RADIUS_SOURCE,
} from "./design-system-patterns.js";

/**
 * The few node shapes these rules read, typed here so the rules need no
 * ESTree type package (whose types also stop at plain JavaScript). Each
 * report points at a node's `loc`.
 *
 * @typedef {{ start: { line: number, column: number }, end: { line: number, column: number } }} Loc
 * @typedef {{ value: unknown, loc: Loc }} StringLiteral
 * @typedef {{ value: { raw: string }, loc: Loc }} TemplateText
 * @typedef {{ type: string, value?: unknown }} JsxExpression
 * @typedef {{ type: string, value?: unknown, expression?: JsxExpression }} JsxAttributeValue
 * @typedef {{ type: string, name: { name?: unknown }, value?: JsxAttributeValue | null, loc: Loc }} JsxAttribute
 * @typedef {{ name: { type: string, name?: unknown }, attributes: JsxAttribute[], loc: Loc }} JsxOpeningElement
 */

const FONT_SIZE = new RegExp(ARBITRARY_FONT_SIZE_SOURCE);
const PANEL_RADIUS = new RegExp(PANEL_RADIUS_SOURCE);
const HIDDEN_FOCUS_OUTLINE = new RegExp(HIDDEN_FOCUS_OUTLINE_SOURCE);
const FOCUS_OUTLINE_STYLE = new RegExp(FOCUS_OUTLINE_STYLE_SOURCE);

/**
 * Raw elements a feature screen should not build itself, with the shared
 * component to reach for instead.
 */
export const RAW_ELEMENT_REPLACEMENTS = {
  h1: 'PageHeader (or CardTitle as="h1" on a page with no header)',
  h2: "SectionHeader or CardTitle",
  h3: "SectionHeader or CardTitle",
  h4: "SectionHeader or CardTitle",
  h5: "SectionHeader or CardTitle",
  h6: "SectionHeader or CardTitle",
  button: "Button, IconButton, DisclosureTrigger or a ListRow with onClick",
  select: "Select or Combobox",
  textarea: "Textarea",
  table: "Table or DataTable",
  label: "Field, or the label prop of Checkbox, Switch or RadioGroupItem",
};

/** Native input types a shared picker replaces, and that picker. */
export const NATIVE_INPUT_REPLACEMENTS = {
  date: "DatePicker",
  time: "TimePicker",
  "datetime-local": "DateTimeField",
  month: "MonthPicker",
  week: "DatePicker",
  number: "NumberInput",
};

/**
 * Calls `report` for every string literal and template text in the file.
 *
 * @param {(loc: Loc, text: string) => void} check
 */
function onStrings(check) {
  return {
    /** @param {StringLiteral} node */
    Literal(node) {
      if (typeof node.value === "string") check(node.loc, node.value);
    },
    /** @param {TemplateText} node */
    TemplateElement(node) {
      check(node.loc, node.value.raw);
    },
  };
}

/** @type {import("eslint").Rule.RuleModule} */
const noLiteralFontSize = {
  meta: {
    type: "suggestion",
    docs: { description: "Use a typography role instead of a literal font size." },
    messages: {
      literal:
        "Use a typography role (text-display, text-title-lg, text-title, text-heading, text-body-lg, text-body, text-body-sm, text-label, text-caption; on wall screens text-kiosk-display, text-kiosk-title) instead of a literal font size.",
    },
    schema: [],
  },
  create(context) {
    return onStrings((loc, text) => {
      if (FONT_SIZE.test(text)) context.report({ loc, messageId: "literal" });
    });
  },
};

/** @type {import("eslint").Rule.RuleModule} */
const noPanelRadius = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "A bordered panel takes the card radius from Card, not rounded-sm or rounded-xs.",
    },
    messages: {
      panel:
        "A bordered box with rounded-sm or rounded-xs is the retired panel look. Use Card (radius lg), Alert for a message, or a List; small controls keep their own radius inside packages/ui.",
    },
    schema: [],
  },
  create(context) {
    return onStrings((loc, text) => {
      if (PANEL_RADIUS.test(text)) context.report({ loc, messageId: "panel" });
    });
  },
};

/** @type {import("eslint").Rule.RuleModule} */
const noHiddenFocusOutline = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Keep the base focus-visible ring: no outline-none or outline-hidden without a focus-visible outline of its own.",
    },
    messages: {
      hidden:
        "outline-none and outline-hidden beat the base :focus-visible ring, so keyboard focus becomes invisible (WCAG 2.4.7). Drop it (add focus-visible:-outline-offset-2 to keep the ring inside a row), or give the same element its own focus-visible:outline-* style.",
    },
    schema: [],
  },
  create(context) {
    return onStrings((loc, text) => {
      if (HIDDEN_FOCUS_OUTLINE.test(text) && !FOCUS_OUTLINE_STYLE.test(text)) {
        context.report({ loc, messageId: "hidden" });
      }
    });
  },
};

/** @type {import("eslint").Rule.RuleModule} */
const noRawElements = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Feature screens use shared components, not raw headings, buttons or form elements.",
    },
    messages: {
      raw: "Use {{replacement}} instead of a raw <{{element}}>.",
    },
    schema: [],
  },
  create(context) {
    return {
      /** @param {JsxOpeningElement} node */
      JSXOpeningElement(node) {
        const element = node.name.type === "JSXIdentifier" ? node.name.name : undefined;
        if (typeof element !== "string" || !Object.hasOwn(RAW_ELEMENT_REPLACEMENTS, element)) {
          return;
        }
        context.report({
          loc: node.loc,
          messageId: "raw",
          data: {
            element,
            replacement:
              RAW_ELEMENT_REPLACEMENTS[
                /** @type {keyof typeof RAW_ELEMENT_REPLACEMENTS} */ (element)
              ],
          },
        });
      },
    };
  },
};

/**
 * The string a JSX attribute holds, when it is a plain string
 * (`type="date"` or `type={"date"}`); undefined otherwise.
 *
 * @param {JsxAttributeValue | null | undefined} value
 * @returns {string | undefined}
 */
function staticAttributeValue(value) {
  if (!value) return undefined;
  if (value.type === "Literal" && typeof value.value === "string") return value.value;
  const expression = value.type === "JSXExpressionContainer" ? value.expression : undefined;
  if (expression?.type === "Literal" && typeof expression.value === "string") {
    return expression.value;
  }
  return undefined;
}

/** @type {import("eslint").Rule.RuleModule} */
const noNativePickers = {
  meta: {
    type: "suggestion",
    docs: { description: "Dates, times, months and numbers go through the shared pickers." },
    messages: {
      native: 'Use {{replacement}} instead of an input with type="{{type}}".',
    },
    schema: [],
  },
  create(context) {
    return {
      /** @param {JsxOpeningElement} node */
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier") return;
        if (node.name.name !== "input" && node.name.name !== "Input") return;
        for (const attribute of node.attributes) {
          if (attribute.type !== "JSXAttribute" || attribute.name.name !== "type") continue;
          const type = staticAttributeValue(attribute.value);
          if (type === undefined || !Object.hasOwn(NATIVE_INPUT_REPLACEMENTS, type)) continue;
          context.report({
            loc: attribute.loc,
            messageId: "native",
            data: {
              type,
              replacement:
                NATIVE_INPUT_REPLACEMENTS[
                  /** @type {keyof typeof NATIVE_INPUT_REPLACEMENTS} */ (type)
                ],
            },
          });
        }
      },
    };
  },
};

/** The plugin, registered under the `design-system` prefix. */
export const designSystemPlugin = {
  meta: { name: "@newsekolah/design-system" },
  rules: {
    "no-literal-font-size": noLiteralFontSize,
    "no-panel-radius": noPanelRadius,
    "no-hidden-focus-outline": noHiddenFocusOutline,
    "no-raw-elements": noRawElements,
    "no-native-pickers": noNativePickers,
  },
};

const NATIVE_DIALOG_MESSAGE =
  "The browser's own dialogs block the page and ignore the theme and language. Use ConfirmDialog, a toast or an inline Alert.";

/**
 * `window.confirm`, `alert` and `prompt`, as globals and as properties of
 * `window`, `globalThis` and `self`. Core rules, so a local variable that
 * happens to be called `confirm` (a translator) is not caught.
 */
export const nativeDialogRules = {
  "no-restricted-globals": [
    "error",
    { name: "confirm", message: NATIVE_DIALOG_MESSAGE },
    { name: "alert", message: NATIVE_DIALOG_MESSAGE },
    { name: "prompt", message: NATIVE_DIALOG_MESSAGE },
  ],
  "no-restricted-properties": [
    "error",
    ...["window", "globalThis", "self"].flatMap((object) =>
      ["confirm", "alert", "prompt"].map((property) => ({
        object,
        property,
        message: NATIVE_DIALOG_MESSAGE,
      })),
    ),
  ],
};
