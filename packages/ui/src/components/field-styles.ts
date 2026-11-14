/**
 * Border and focus states shared by every outlined field: Input, Textarea,
 * and the Select and Combobox triggers.
 *
 * The border is the only thing that shows where an empty field is, so it
 * rests on `border-strong` (3:1 on every surface), darkens one step on
 * hover, takes the accent on keyboard focus and turns `danger` whenever
 * `aria-invalid` is set, whether by the `invalid` prop, by `Field` or by
 * `FormControl`.
 *
 * Each state only sets `--field-border`, and the border reads that
 * variable, so a hover can never outrank the invalid state (variant order
 * puts `aria-invalid:` after `hover:` and `focus-visible:`). A caller's own
 * border color, such as `border-accent` on a changed gradebook cell,
 * replaces `border-(--field-border)` through cn() and keeps its color in
 * every state instead of turning grey under the pointer.
 *
 * The focus ring sits flush on the border (offset 0), so the two read as
 * one 3px edge instead of a border, a gap and a ring; an invalid field's
 * ring is the danger color.
 */
export const FIELD_BORDER_CLASSES = [
  "border border-(--field-border) [--field-border:var(--color-border-strong)] transition-colors",
  "hover:[--field-border:var(--color-fg-muted)]",
  "focus-visible:[--field-border:var(--color-accent)] focus-visible:outline-offset-0",
  "aria-invalid:[--field-border:var(--color-danger)] aria-invalid:focus-visible:outline-danger",
].join(" ");

/**
 * The same states for a box that wraps a text input (an Input with an
 * icon or button inside it, the time and number fields): the box draws
 * the border and the focus ring, the input inside draws neither, so the
 * ring hugs the whole field, adornments included. Only the input's own
 * focus lights the box; a button inside it (show password, clear) keeps
 * its own ring.
 *
 * Here variant order is not enough: the focus rule's
 * `:has(:is(input:focus-visible, ...))` outranks the invalid rule's
 * `:has([aria-invalid=true])` (0,2,1 against 0,2,0), so a focused invalid
 * box would show the accent border inside a danger ring. The last rule
 * (0,3,0) puts danger back for exactly that case.
 */
export const FIELD_SHELL_BORDER_CLASSES = [
  "border border-(--field-border) [--field-border:var(--color-border-strong)] transition-colors",
  "hover:[--field-border:var(--color-fg-muted)]",
  "has-[input:focus-visible,textarea:focus-visible]:[--field-border:var(--color-accent)]",
  "has-[input:focus-visible,textarea:focus-visible]:outline-2",
  "has-[input:focus-visible,textarea:focus-visible]:outline-offset-0",
  "has-[input:focus-visible,textarea:focus-visible]:outline-focus-ring",
  "has-[[aria-invalid=true]]:[--field-border:var(--color-danger)]",
  "has-[[aria-invalid=true]:focus-visible]:outline-danger",
  "has-[[aria-invalid=true]:focus-visible]:[--field-border:var(--color-danger)]",
].join(" ");

/**
 * A disabled field reads as a quiet, sunken box with muted text rather
 * than a half-transparent one: it stays legible (a locked value is still a
 * value) and never shows a hover. `disabled:` sorts after `hover:`, so the
 * quiet border wins.
 */
export const FIELD_DISABLED_CLASSES =
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-fg-muted " +
  "disabled:[--field-border:var(--color-border)]";

/** `FIELD_DISABLED_CLASSES` for a shell around a disabled input. */
export const FIELD_SHELL_DISABLED_CLASSES =
  "has-[input:disabled,textarea:disabled]:cursor-not-allowed " +
  "has-[input:disabled,textarea:disabled]:bg-surface-sunken " +
  "has-[input:disabled,textarea:disabled]:text-fg-muted " +
  "has-[input:disabled,textarea:disabled]:[--field-border:var(--color-border)]";

export type FieldSize = "sm" | "md";

/**
 * Field heights. Every field is a 44px target wherever the pointer is
 * coarse (a phone, a tablet, a touch laptop) and on any screen narrower
 * than md; only a fine pointer on a wide screen gets the compact box: 36px
 * for `md`, 32 for `sm` (dense filters, table toolbars), the same heights
 * as Button's two sizes there.
 */
export const FIELD_HEIGHT: Record<FieldSize, string> = {
  md: "h-11 md:pointer-fine:h-9",
  sm: "h-11 md:pointer-fine:h-8",
};

/**
 * Raises a field's body text to 16px wherever its box is the 44px touch
 * size, because iOS Safari zooms the page into any focused field under
 * 16px (the `field-text-touch` utility in styles.css). Put it on the
 * element that carries the text or on the shell around it: the inner
 * input of a shell inherits it.
 */
export const FIELD_TOUCH_TEXT = "field-text-touch";

/**
 * Body text for `md`; the compact `sm` field takes the denser table text
 * with a cursor. Both are 16px on touch (`FIELD_TOUCH_TEXT`).
 */
export const FIELD_TEXT: Record<FieldSize, string> = {
  md: `text-body ${FIELD_TOUCH_TEXT}`,
  sm: `text-body ${FIELD_TOUCH_TEXT} md:pointer-fine:text-body-sm`,
};

/**
 * Horizontal padding, and the inset an adornment sits at. 12px keeps the
 * text where every other field's text starts; an icon sits at the same
 * 12px, the text then starts after it plus an 8px gap.
 */
export const FIELD_PADDING: Record<FieldSize, string> = {
  md: "px-3",
  sm: "px-3 md:pointer-fine:px-2.5",
};
