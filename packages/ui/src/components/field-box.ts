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
 * A small round button inside a field (clear, stepper, list toggle): 40px
 * on a touch screen, which is all a 44px field has room for, 24 with a
 * cursor. Placed so its icon lines up with `Select`'s chevron.
 */
export const FIELD_ICON_BUTTON =
  "inline-flex size-10 md:size-6 shrink-0 items-center justify-center rounded-full text-fg-muted " +
  "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] " +
  "hover:bg-bg hover:text-fg disabled:pointer-events-none disabled:opacity-40 [&>svg]:size-4";
