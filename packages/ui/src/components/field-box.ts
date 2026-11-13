/**
 * The bordered box single-line fields share, so the pickers and the number
 * field line up with `Input` and `Select`: 44px on a touch screen, 36 once
 * there is a cursor, radius md, a quiet border that turns accent on focus.
 * Internal to the package; `Input` and `Select` keep their own copies until
 * the foundation pass folds them onto one definition.
 */
export const FIELD_BOX =
  "flex h-11 md:h-9 w-full min-w-0 items-center gap-2 rounded-md border border-border bg-surface " +
  "px-3 text-base text-fg transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]";

/** For a box that is itself the focusable element (a picker's trigger button). */
export const FIELD_BOX_BUTTON =
  "text-left focus-visible:border-accent data-[state=open]:border-accent " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/**
 * For a box wrapping a text input: the focus ring is drawn on the box, the
 * input's own outline is suppressed, so the ring hugs the whole field
 * (adornments and stepper buttons included) like `Input`'s does.
 */
export const FIELD_BOX_WITH_INPUT =
  "has-[input:focus-visible]:border-accent has-[input:focus-visible]:outline-2 " +
  "has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent";

export const FIELD_INNER_INPUT =
  "h-full min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-muted " +
  "focus-visible:outline-none disabled:cursor-not-allowed";

export const FIELD_BOX_INVALID = "border-danger";

export const FIELD_BOX_DISABLED = "cursor-not-allowed opacity-50";

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
  "text-fg-muted focus-visible:outline-none md:my-0 md:size-6 " +
  "disabled:pointer-events-none disabled:opacity-40";

/** The visible circle inside a `FIELD_ICON_BUTTON`: hover and the focus ring draw here. */
export const FIELD_ICON_FACE =
  "flex size-10 items-center justify-center rounded-full md:size-full [&>svg]:size-4 " +
  "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] " +
  "group-hover/icon:bg-bg group-hover/icon:text-fg " +
  "group-focus-visible/icon:outline-2 group-focus-visible/icon:outline-offset-2 " +
  "group-focus-visible/icon:outline-accent";
