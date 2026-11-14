"use client";

import {
  Badge,
  Button,
  DataList,
  DataListItem,
  Sheet,
  SheetContent,
  useMediaQuery,
} from "@newsekolah/ui";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { GradeLevel } from "../../school/api";
import type { CalendarEvent } from "../api";
import { EVENT_KIND_TONE } from "../lib/event-kinds";

import { useFormatEventRange } from "./calendar-agenda";

/**
 * One event, read-only, for every reader: full name, dates, kind and the
 * grade levels it applies to. A manager also gets edit and delete in the
 * footer. A drawer from the right on a wide screen, a bottom sheet on a
 * phone.
 */
export function EventDetailSheet({
  event,
  gradeLevels,
  canManage,
  onClose,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent | undefined;
  gradeLevels: readonly GradeLevel[];
  canManage: boolean;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}): ReactElement {
  const t = useTranslations("app.calendar");
  const formatRange = useFormatEventRange();
  const wide = useMediaQuery("(min-width: 640px)");
  const levels = (event?.grade_level_ids ?? [])
    .map((id) => gradeLevels.find((level) => level.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <Sheet
      open={event !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side={wide ? "right" : "bottom"}
        size="md"
        title={event?.name ?? t("detailTitle")}
        footer={
          canManage && event ? (
            <>
              <Button
                variant="ghost"
                icon={<Trash2 />}
                className="mr-auto text-danger"
                onClick={() => {
                  onDelete(event);
                }}
              >
                {t("deleteEvent")}
              </Button>
              <Button
                variant="secondary"
                icon={<Pencil />}
                onClick={() => {
                  onEdit(event);
                }}
              >
                {t("editEvent")}
              </Button>
            </>
          ) : undefined
        }
      >
        {event && (
          <DataList>
            <DataListItem label={t("detail.dates")}>{formatRange(event)}</DataListItem>
            <DataListItem label={t("form.kind")}>
              <Badge tone={EVENT_KIND_TONE[event.kind]} dot>
                {t(`kind.${event.kind}`)}
              </Badge>
            </DataListItem>
            <DataListItem label={t("detail.appliesTo")}>
              {levels.length > 0 ? levels.join(", ") : t("detail.wholeSchool")}
            </DataListItem>
          </DataList>
        )}
      </SheetContent>
    </Sheet>
  );
}
