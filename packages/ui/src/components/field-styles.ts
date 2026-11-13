/**
 * Border and focus states shared by every outlined field: Input, Textarea,
 * and the Select and Combobox triggers.
 *
 * The border is the only thing that shows where an empty field is, so it
 * rests on `border-strong` (3:1 on every surface), darkens one step on
 * hover, takes the accent on keyboard focus and turns `danger` whenever
 * `aria-invalid` is set, whether by the `invalid` prop or by `FormControl`.
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
