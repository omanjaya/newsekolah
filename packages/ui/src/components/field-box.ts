import {
  FIELD_BORDER_CLASSES,
  FIELD_DISABLED_CLASSES,
  FIELD_HEIGHT,
  FIELD_SHELL_BORDER_CLASSES,
  FIELD_SHELL_DISABLED_CLASSES,
  FIELD_TEXT,
} from "./field-styles.js";

/**
 * The bordered box single-line fields share, so the pickers and the number
 * field are one family with `Input` and `Select`: the same height (44px
 * wherever the pointer is coarse, 36 with a cursor on a wide screen),
 * radius, surface, body text (16px on touch, so iOS does not zoom into the
 * input inside) and the border states of field-styles.ts. Internal to the
 * package.
 */
export const FIELD_BOX = `flex ${FIELD_HEIGHT.md} w-full min-w-0 items-center gap-2 rounded-md bg-surface px-3 ${FIELD_TEXT.md} text-fg`;

/** For a box that is itself the focusable element (a picker's trigger button). */
export const FIELD_BOX_BUTTON = `text-left ${FIELD_BORDER_CLASSES} ${FIELD_DISABLED_CLASSES} data-[state=open]:[--field-border:var(--color-accent)]`;

/**
 * For a box wrapping a text input: the focus ring is drawn on the box and
 * the input's own outline is suppressed, so the ring hugs the whole field
 * (adornments and stepper buttons included) like `Input`'s does.
 */
export const FIELD_BOX_WITH_INPUT = `${FIELD_SHELL_BORDER_CLASSES} ${FIELD_SHELL_DISABLED_CLASSES}`;

/** The input inside a `FIELD_BOX`; it carries the touch size itself too, so it holds outside one. */
export const FIELD_INNER_INPUT =
  `h-full min-w-0 flex-1 bg-transparent ${FIELD_TEXT.md} text-fg outline-none placeholder:text-fg-muted ` +
  "focus-visible:outline-none disabled:cursor-not-allowed";

/**
 * Forces the danger border on a box whose `aria-invalid` sits elsewhere.
 * Kept for callers that pass `invalid` without the attribute; a trigger
 * with `aria-invalid` already gets it from `FIELD_BORDER_CLASSES`.
 */
export const FIELD_BOX_INVALID = "[--field-border:var(--color-danger)]";

export const FIELD_BOX_DISABLED = "cursor-not-allowed bg-surface-sunken text-fg-muted";

/**
 * A small round button inside a field (clear, stepper, list toggle). On a
 * touch screen the button is a 44px target, as Checkbox's is: that is one
 * pixel more each way than the inside of a 44px field, which -my-px hands
 * back so the field does not grow. What it shows is `FIELD_ICON_FACE`, a
 * 40px circle there and 24 with a cursor, placed so its icon lines up with
 * `Select`'s chevron. Wrap the icon in a span with that class.
 */
export const FIELD_ICON_BUTTON =
  "group/icon inline-flex size-11 -my-px shrink-0 items-center justify-center rounded-full " +
  "text-fg-muted focus-visible:outline-none md:pointer-fine:my-0 md:pointer-fine:size-6 " +
  "disabled:pointer-events-none disabled:opacity-40";

/** The visible circle inside a `FIELD_ICON_BUTTON`: hover, press and the focus ring draw here. */
export const FIELD_ICON_FACE =
  "flex size-10 items-center justify-center rounded-full md:pointer-fine:size-full [&>svg]:size-4 " +
  "transition-colors group-hover/icon:bg-state-hover group-hover/icon:text-fg " +
  "group-active/icon:bg-state-pressed " +
  "group-focus-visible/icon:outline-2 group-focus-visible/icon:outline-offset-2 " +
  "group-focus-visible/icon:outline-focus-ring";
