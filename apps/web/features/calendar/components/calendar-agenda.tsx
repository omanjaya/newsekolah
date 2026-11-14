"use client";

import { List, ListRow, cn } from "@newsekolah/ui";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { CalendarEvent } from "../api";
import { EVENT_KIND_TONE, EVENT_KINDS, TONE_DOT } from "../lib/event-kinds";

function atMidnight(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/** "14 Nov" for one day, "14-16 Nov" or "28 Nov-2 Des" for a range. */
export function useFormatEventRange(): (event: CalendarEvent) => string {
  const format = useFormatter();
  return (event) => {
    const day = { day: "numeric", month: "short", year: "numeric" } as const;
    if (event.end_date === event.date) return format.dateTime(atMidnight(event.date), day);
    return format.dateTimeRange(atMidnight(event.date), atMidnight(event.end_date), day);
  };
}

/** A soft dot in the event kind's hue. */
export function KindDot({
  event,
  className,
}: {
  event: Pick<CalendarEvent, "kind">;
  className?: string;
}): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full",
        TONE_DOT[EVENT_KIND_TONE[event.kind]],
        className,
      )}
    />
  );
}

/** The colour key under the month: one dot and name per kind. */
export function KindLegend({ className }: { className?: string }): ReactElement {
  const t = useTranslations("app.calendar");
  return (
    <ul
      aria-label={t("legend")}
      className={cn("flex flex-wrap gap-x-4 gap-y-2 text-caption text-fg-muted", className)}
    >
      {EVENT_KINDS.map((kind) => (
        <li key={kind} className="flex items-center gap-1.5">
          <KindDot event={{ kind }} />
          {t(`kind.${kind}`)}
        </li>
      ))}
    </ul>
  );
}

/** A list of events, each opening its read-only detail. */
export function EventList({
  events,
  onOpen,
}: {
  events: readonly CalendarEvent[];
  onOpen: (event: CalendarEvent) => void;
}): ReactElement {
  const t = useTranslations("app.calendar");
  const formatRange = useFormatEventRange();
  return (
    <List variant="inset">
      {events.map((event) => (
        <ListRow
          key={event.id}
          leading={<KindDot event={event} className="size-2.5" />}
          title={event.name}
          meta={`${t(`kind.${event.kind}`)} · ${formatRange(event)}`}
          onClick={() => {
            onOpen(event);
          }}
        />
      ))}
    </List>
  );
}
