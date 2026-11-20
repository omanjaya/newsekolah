import type { CategoryTone } from "@newsekolah/ui";

import type { CalendarEvent, CalendarEventKind } from "../api";

/** Every kind, in the order the legend and the form list them. */
export const EVENT_KINDS: CalendarEventKind[] = [
  "holiday",
  "no_school",
  "semester_break",
  "exam",
  "event",
];

/**
 * The category hue of each kind: days off read warm (red, amber, purple),
 * school days with something on read cool (blue, green). The name always
 * carries the meaning too, never the colour alone.
 */
export const EVENT_KIND_TONE: Record<CalendarEventKind, CategoryTone> = {
  holiday: "red",
  no_school: "amber",
  semester_break: "purple",
  exam: "blue",
  event: "green",
};

/** Solid dots and soft chips per tone, spelled out so Tailwind sees each class. */
export const TONE_DOT: Record<CategoryTone, string> = {
  red: "bg-category-red",
  amber: "bg-category-amber",
  purple: "bg-category-purple",
  blue: "bg-category-blue",
  green: "bg-category-green",
};

export const TONE_CHIP: Record<CategoryTone, string> = {
  red: "bg-category-red-soft text-category-red-soft-fg",
  amber: "bg-category-amber-soft text-category-amber-soft-fg",
  purple: "bg-category-purple-soft text-category-purple-soft-fg",
  blue: "bg-category-blue-soft text-category-blue-soft-fg",
  green: "bg-category-green-soft text-category-green-soft-fg",
};

/** The events that cover `iso` ("YYYY-MM-DD"), inclusive of both ends. */
export function eventsOn(events: readonly CalendarEvent[], iso: string): CalendarEvent[] {
  return events.filter((event) => iso >= event.date && iso <= event.end_date);
}

/**
 * The kinds that cancel lessons for the days they cover, matching the
 * API's academic calendar rule; an exam or an ordinary event is still a
 * school day.
 */
export const NON_TEACHING_KINDS: ReadonlySet<CalendarEventKind> = new Set([
  "holiday",
  "no_school",
  "semester_break",
]);

/**
 * The non-teaching event that cancels lessons on `iso` for a class of
 * `gradeLevelId`, if any. An event scoped to other grade levels does not
 * count; a school-wide event (no grade levels) always does.
 */
export function nonTeachingEventOn(
  events: readonly CalendarEvent[],
  iso: string,
  gradeLevelId?: string,
): CalendarEvent | undefined {
  return eventsOn(events, iso).find(
    (event) =>
      NON_TEACHING_KINDS.has(event.kind) &&
      (!event.grade_level_ids?.length ||
        (gradeLevelId !== undefined && event.grade_level_ids.includes(gradeLevelId))),
  );
}

/** The events that touch the month `month` ("YYYY-MM"), earliest first. */
export function eventsInMonth(events: readonly CalendarEvent[], month: string): CalendarEvent[] {
  const first = `${month}-01`;
  const last = `${month}-31`;
  return events
    .filter((event) => event.date <= last && event.end_date >= first)
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
