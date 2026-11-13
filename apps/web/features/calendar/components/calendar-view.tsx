"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  PageHeader,
  Skeleton,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { businessNow } from "../../../lib/simulation/clock";
import { todayInZone } from "../../../lib/tenant-date";
import { AcademicWorkspaceLinks } from "../../academic/components/academic-workspace-links";
import { useGradeLevelsQuery } from "../../school/api";
import {
  type CalendarEvent,
  type CalendarEventKind,
  useCalendarEventsQuery,
  useCreateCalendarEventMutation,
  useDeleteCalendarEventMutation,
  useUpdateCalendarEventMutation,
} from "../api";
import { buildMonthGrid, toISODate } from "../lib/calendar-dates";

import { EventFormDialog } from "./event-form-dialog";

// Non-teaching kinds get the accent-tinted variant so they stand out from
// exams and ordinary events at a glance; the event name itself always
// carries the actual meaning (never color alone).
const NON_TEACHING_KINDS: CalendarEventKind[] = ["holiday", "no_school", "semester_break"];

function eventsForDay(events: CalendarEvent[], iso: string): CalendarEvent[] {
  return events.filter((e) => iso >= e.date && iso <= e.end_date);
}

/** A month grid of the active academic year's calendar: holidays, exams, events, and semester breaks. */
export function CalendarView(): ReactElement {
  const t = useTranslations("app.calendar");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_academic_years");
  const { me } = useSession();
  const today = todayInZone(me?.tenant.timezone);

  const [month, setMonth] = useState(() => {
    const now = businessNow();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | undefined>(undefined);
  const [defaultDate, setDefaultDate] = useState(today);
  // The dialog keeps its field state from mount, so each open remounts it to
  // start from the event being edited (or blank for a new one).
  const [formKey, setFormKey] = useState(0);
  const [deleting, setDeleting] = useState<CalendarEvent | undefined>(undefined);

  const query = useCalendarEventsQuery();
  const gradeLevels = useGradeLevelsQuery();
  const createMutation = useCreateCalendarEventMutation();
  const updateMutation = useUpdateCalendarEventMutation();
  const deleteMutation = useDeleteCalendarEventMutation();

  const events = useMemo(() => query.data?.data ?? [], [query.data]);
  const days = useMemo(() => buildMonthGrid(month), [month]);
  const agendaDays = useMemo(
    () =>
      days
        .filter((d) => d.inMonth)
        .map(({ date }) => ({
          date,
          iso: toISODate(date),
          dayEvents: eventsForDay(events, toISODate(date)),
        }))
        .filter((d) => d.dayEvents.length > 0),
    [days, events],
  );

  function openForm(event: CalendarEvent | undefined, date: string) {
    setEditing(event);
    setDefaultDate(date);
    setFormKey((key) => key + 1);
    setFormOpen(true);
  }

  function handleError(error: unknown) {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  }

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the header
    // row and weekday row stay fixed, the month grid takes the remaining
    // height and divides it across its week rows. Mobile keeps the normal
    // agenda list and document scroll.
    <div className="flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
      <AcademicWorkspaceLinks area="schedule" />
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          canManage && (
            <Button
              size="sm"
              icon={<Plus />}
              onClick={() => {
                openForm(undefined, today);
              }}
            >
              {t("addEvent")}
            </Button>
          )
        }
      />
      <div className="flex items-center justify-between">
        <IconButton
          aria-label={t("previousMonth")}
          variant="outline"
          icon={<ChevronLeft />}
          onClick={() => {
            setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
          }}
        />
        <p className="text-[15px] font-medium">
          {month.toLocaleDateString(t("locale"), { month: "long", year: "numeric" })}
        </p>
        <IconButton
          aria-label={t("nextMonth")}
          variant="outline"
          icon={<ChevronRight />}
          onClick={() => {
            setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
          }}
        />
      </div>

      {query.isLoading ? (
        <Skeleton className="h-96 w-full" aria-busy="true" />
      ) : (
        <>
          {/* Desktop and tablet: full month grid. Seven columns need real width to stay legible,
              so this stays hidden below md and the agenda list below takes over. The weekday
              row is fixed height; the week rows below it share the remaining viewport height
              equally so the whole month is always visible without the page scrolling. */}
          <div className="hidden overflow-hidden rounded-xs border border-border md:flex md:min-h-0 md:flex-1 md:flex-col">
            <div className="grid grid-cols-7 gap-px border-b border-border bg-border text-[13px]">
              {(t.raw("weekdays") as string[]).map((label) => (
                <div
                  key={label}
                  className="bg-surface px-2 py-1 text-center font-medium text-fg-muted"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-px overflow-hidden bg-border text-[13px]">
              {days.map(({ date, inMonth }) => {
                const iso = toISODate(date);
                const dayEvents = eventsForDay(events, iso);
                return (
                  <div
                    key={iso}
                    className={`flex min-h-24 flex-col gap-1 bg-surface p-1.5 md:h-full md:min-h-0 ${inMonth ? "" : "opacity-40"}`}
                  >
                    <span className="shrink-0 text-[12px] text-fg-muted">{date.getDate()}</span>
                    <div className="flex flex-col gap-1 overflow-hidden md:min-h-0 md:flex-1 md:overflow-y-auto">
                      {dayEvents.map((e) => (
                        <EventChip
                          key={e.id}
                          event={e}
                          canManage={canManage}
                          onOpen={() => {
                            openForm(e, iso);
                          }}
                          className="shrink-0 text-left"
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile: agenda list of days that have events. A day's worth of chips reflows into
              full-width rows instead of the grid, which has no room for touch targets or text
              on a phone. */}
          <div className="flex flex-col md:hidden">
            {agendaDays.map(({ date, iso, dayEvents }) => (
              <div key={iso} className="flex gap-3 border-b border-border py-3 last:border-b-0">
                <div className="flex w-12 shrink-0 flex-col items-center pt-2">
                  <span className="text-[12px] text-fg-muted">
                    {date.toLocaleDateString(t("locale"), { weekday: "short" })}
                  </span>
                  <span className="text-[16px] font-medium">{date.getDate()}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {dayEvents.map((e) => (
                    <EventChip
                      key={e.id}
                      event={e}
                      canManage={canManage}
                      onOpen={() => {
                        openForm(e, iso);
                      }}
                      className="min-h-11 w-full rounded-xs border border-border px-3 py-2 text-left"
                    />
                  ))}
                </div>
              </div>
            ))}
            {agendaDays.length === 0 && events.length > 0 && (
              <p className="py-6 text-center text-[13px] text-fg-muted">{t("emptyMonth")}</p>
            )}
          </div>
        </>
      )}

      {!query.isLoading && events.length === 0 && (
        <EmptyState
          icon={<domainIcons.schedule aria-hidden="true" />}
          title={t("emptyTitle")}
          description={canManage ? t("emptyBody") : t("emptyBodyReadOnly")}
        />
      )}

      <EventFormDialog
        key={formKey}
        open={formOpen}
        initial={editing}
        defaultDate={defaultDate}
        gradeLevels={gradeLevels.data?.data ?? []}
        pending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={setFormOpen}
        onDelete={
          editing && canManage
            ? () => {
                setDeleting(editing);
              }
            : undefined
        }
        onSubmit={(body) => {
          if (editing) {
            updateMutation.mutate(
              { id: editing.id, body },
              {
                onSuccess: () => {
                  setFormOpen(false);
                  toast.success(t("eventSaved"));
                },
                onError: handleError,
              },
            );
          } else {
            createMutation.mutate(body, {
              onSuccess: () => {
                setFormOpen(false);
                toast.success(t("eventSaved"));
              },
              onError: handleError,
            });
          }
        }}
      />

      <ConfirmDialog
        open={deleting !== undefined}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined);
        }}
        title={t("deleteConfirmTitle")}
        description={deleting ? t("deleteConfirmBody", { name: deleting.name }) : ""}
        destructive
        confirming={deleteMutation.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteMutation.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(undefined);
              setFormOpen(false);
              toast.success(t("eventDeleted"));
            },
            onError: handleError,
          });
        }}
      />
    </div>
  );
}

/**
 * Managers open the event for editing; readers get a plain label (with the
 * full name on hover) because a disabled button promises an action that
 * never comes.
 */
function EventChip({
  event,
  canManage,
  onOpen,
  className,
}: {
  event: CalendarEvent;
  canManage: boolean;
  onOpen: () => void;
  className: string;
}): ReactElement {
  const badge = (
    <Badge
      variant={NON_TEACHING_KINDS.includes(event.kind) ? "accent" : "neutral"}
      className="w-full truncate"
    >
      {event.name}
    </Badge>
  );
  if (!canManage) {
    return (
      <div title={event.name} className={className}>
        {badge}
      </div>
    );
  }
  return (
    <button type="button" onClick={onOpen} className={className}>
      {badge}
    </button>
  );
}
