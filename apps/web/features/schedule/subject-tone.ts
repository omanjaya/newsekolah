export type ScheduleTone = "green" | "amber" | "purple" | "blue" | "red";

const TONES: readonly ScheduleTone[] = ["green", "amber", "purple", "blue", "red"];

/**
 * A stable soft-category tone for a subject, so the same subject always
 * paints the same color everywhere its lesson blocks render -- the week
 * grid, the day grid, the mobile agenda, and the mobile day list all call
 * this rather than each picking colors on their own. The hash only needs
 * to be deterministic and roughly even across the five tones, not
 * cryptographic; it mirrors `Avatar`'s `paletteClassFor`
 * (packages/ui/src/components/avatar.tsx), keyed by subject id instead of
 * name so renaming a subject never repaints its lessons.
 */
export function subjectTone(subjectId: string): ScheduleTone {
  let hash = 0;
  for (let i = 0; i < subjectId.length; i += 1) {
    hash = (hash * 31 + subjectId.charCodeAt(i)) >>> 0;
  }
  return TONES[hash % TONES.length] ?? "green";
}

/**
 * Full class names so Tailwind's scanner generates every one it can pick
 * (see `StatTile`'s `TONE` map for the same pattern). Each pairing is one
 * of the five AA-checked soft-category tints (docs/07-ui-ux.md, "Hijau
 * Segar"), used as the fill for a lesson block's card across every
 * schedule view.
 */
export const SUBJECT_TONE_CLASSES: Record<ScheduleTone, string> = {
  green: "bg-category-green-soft text-category-green-soft-fg",
  amber: "bg-category-amber-soft text-category-amber-soft-fg",
  purple: "bg-category-purple-soft text-category-purple-soft-fg",
  blue: "bg-category-blue-soft text-category-blue-soft-fg",
  red: "bg-category-red-soft text-category-red-soft-fg",
};
