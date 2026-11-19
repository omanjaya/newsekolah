"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Calendar,
  Card,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  SectionHeader,
  Skeleton,
  SkeletonList,
  cn,
  domainIcons,
  useMediaQuery,
  useToast,
  type CalendarDayInfo,
} from "@newsekolah/ui";
import { Plus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { formatCalendarDate } from "../../../lib/format-calendar-date";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { AcademicWorkspaceLinks } from "../../academic/components/academic-workspace-links";
import { useGradeLevelsQuery } from "../../school/api";
import {
  type CalendarEvent,
  useCalendarEventsQuery,
  useCreateCalendarEventMutation,
  useDeleteCalendarEventMutation,
  useUpdateCalendarEventMutation,
} from "../api";
import { EVENT_KIND_TONE, TONE_CHIP, eventsInMonth, eventsOn } from "../lib/event-kinds";

import { EventList, KindDot, KindLegend } from "./calendar-agenda";
import { EventDetailSheet } from "./event-detail-sheet";
import { EventFormDialog } from "./event-form-dialog";

/** Chips a month cell shows before it says "+n". */
const CHIPS_PER_DAY = 2;

/**
 * The active academic year's calendar for every role: the shared month
 * Calendar with today marked and each event in its kind's colour (with a
 * legend), and beside it (under it on a phone) the chosen day and the
 * month's agenda. Any event opens a read-only detail; a manager also adds
 * by picking an empty day and edits or deletes from the detail.
 */
export function CalendarView(): ReactElement {
  const t = useTranslations("app.calendar");
  const format = useFormatter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_academic_years");
  const { me } = useSession();
  const today = todayInZone(me?.tenant.timezone);

  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | undefined>(undefined);
  const [defaultDate, setDefaultDate] = useState(today);
  // The dialog keeps its field state from mount, so each open remounts it to
  // start from the event being edited (or blank for a new one).
  const [formKey, setFormKey] = useState(0);
  const [viewing, setViewing] = useState<CalendarEvent | undefined>(undefined);
  const [deleting, setDeleting] = useState<CalendarEvent | undefined>(undefined);

  const wide = useMediaQuery("(min-width: 768px)");
  const query = useCalendarEventsQuery();
  const gradeLevels = useGradeLevelsQuery();
  const createMutation = useCreateCalendarEventMutation();
  const updateMutation = useUpdateCalendarEventMutation();
  const deleteMutation = useDeleteCalendarEventMutation();

  const events = useMemo(() => query.data?.data ?? [], [query.data]);
  const monthEvents = useMemo(() => eventsInMonth(events, month), [events, month]);
  const dayEvents = useMemo(() => eventsOn(events, selected), [events, selected]);
  const selectedLabel = formatCalendarDate(format, selected, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

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

  function pickDay(date: string) {
    setSelected(date);
    // An empty day is where a manager adds; a day with events shows them.
    if (canManage && eventsOn(events, date).length === 0) openForm(undefined, date);
  }

  function renderDay(day: CalendarDayInfo): ReactNode {
    if (day.outside) return null;
    const on = eventsOn(events, day.date);
    if (on.length === 0) return null;
    const extra = on.length - CHIPS_PER_DAY;
    return (
      <>
        <span className="flex gap-0.5 md:hidden">
          {on.slice(0, 3).map((event) => (
            <KindDot key={event.id} event={event} className="size-1.5" />
          ))}
        </span>
        {on.slice(0, CHIPS_PER_DAY).map((event) => (
          <span
            key={event.id}
            className={cn(
              "hidden w-full truncate rounded-full px-1.5 text-left text-caption md:block",
              TONE_CHIP[EVENT_KIND_TONE[event.kind]],
            )}
          >
            {event.name}
          </span>
        ))}
        {extra > 0 && (
          <span className="hidden text-caption text-fg-muted md:block">
            {t("moreEvents", { n: extra })}
          </span>
        )}
      </>
    );
  }

  const addButton = (date: string, label: string): ReactElement => (
    <Button
      icon={<Plus />}
      onClick={() => {
        openForm(undefined, date);
      }}
    >
      {label}
    </Button>
  );

  return (
    <AppPage
      variant="wide"
      nav={<AcademicWorkspaceLinks area="schedule" />}
      primaryAction={canManage ? addButton(selected, t("addEvent")) : undefined}
      primaryActionCompact={
        canManage
          ? {
              icon: <Plus />,
              label: t("addEvent"),
              onSelect: () => {
                openForm(undefined, selected);
              },
            }
          : undefined
      }
    >
      {query.isError && !query.data ? (
        <QueryError retry={() => void query.refetch()} error={query.error} />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card padding="md" className="gap-4">
            {query.isLoading ? (
              <Skeleton className="h-96 w-full" aria-busy="true" />
            ) : (
              <Calendar
                // A phone gets the compact month with a dot per event, so
                // the agenda below stays close; a wide screen gets the
                // month view with named chips.
                layout={wide ? "fluid" : "compact"}
                className={wide ? undefined : "mx-auto"}
                value={selected}
                onChange={pickDay}
                month={month}
                onMonthChange={setMonth}
                today={today}
                showOutsideDays={false}
                renderDay={renderDay}
                getDayDescription={(date) => {
                  const on = eventsOn(events, date);
                  return on.length > 0 ? on.map((event) => event.name).join(", ") : undefined;
                }}
              />
            )}
            <KindLegend className="border-t border-line pt-4" />
          </Card>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader
                action={
                  canManage ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Plus />}
                      onClick={() => {
                        openForm(undefined, selected);
                      }}
                    >
                      {t("addShort")}
                    </Button>
                  ) : undefined
                }
              >
                <CardTitle as="h2" className="first-letter:uppercase">
                  {selectedLabel}
                </CardTitle>
              </CardHeader>
              {query.isLoading ? (
                <div className="px-5 pb-5">
                  <SkeletonList rows={2} />
                </div>
              ) : dayEvents.length === 0 ? (
                <p className="px-5 pb-5 text-body-sm text-fg-muted">{t("emptyDay")}</p>
              ) : (
                <EventList events={dayEvents} onOpen={setViewing} />
              )}
            </Card>

            <section className="flex flex-col gap-3">
              <SectionHeader title={t("monthAgenda")} count={monthEvents.length} />
              {query.isLoading ? (
                <SkeletonList rows={3} framed />
              ) : events.length === 0 ? (
                <EmptyState
                  icon={<domainIcons.schedule aria-hidden="true" />}
                  title={t("emptyTitle")}
                  description={canManage ? t("emptyBody") : t("emptyBodyReadOnly")}
                />
              ) : monthEvents.length === 0 ? (
                <EmptyState
                  variant="inline"
                  icon={<domainIcons.schedule aria-hidden="true" />}
                  title={t("emptyMonth")}
                  className="rounded-lg border border-border bg-surface"
                />
              ) : (
                <Card>
                  <EventList events={monthEvents} onOpen={setViewing} />
                </Card>
              )}
            </section>
          </div>
        </div>
      )}

      <EventDetailSheet
        event={viewing}
        gradeLevels={gradeLevels.data?.data ?? []}
        canManage={canManage}
        onClose={() => {
          setViewing(undefined);
        }}
        onEdit={(event) => {
          setViewing(undefined);
          openForm(event, event.date);
        }}
        onDelete={(event) => {
          setDeleting(event);
        }}
      />

      <EventFormDialog
        key={formKey}
        open={formOpen}
        initial={editing}
        defaultDate={defaultDate}
        today={today}
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
                setSelected(body.date);
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
        confirmLabel={t("deleteEvent")}
        tone="danger"
        confirming={deleteMutation.isPending}
        onConfirm={() => {
          if (!deleting) return;
          deleteMutation.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(undefined);
              setViewing(undefined);
              setFormOpen(false);
              toast.success(t("eventDeleted"));
            },
            onError: handleError,
          });
        }}
      />
    </AppPage>
  );
}
