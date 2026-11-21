"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Card,
  EmptyState,
  Field,
  FormActions,
  NumberInput,
  SectionHeader,
  SkeletonList,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TimePicker,
  useMediaQuery,
  useToast,
} from "@newsekolah/ui";
import { CalendarClock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type EmployeeOption,
  type ScheduleDay,
  useReplaceStaffAttendanceScheduleMutation,
  useStaffAttendanceScheduleQuery,
} from "../api";
import { minutesToTimeInput, timeInputToMinutes } from "../time";

import { EmployeeCombobox } from "./employee-combobox";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
/**
 * From `lg` up the week is a five-column table; below it, one card per
 * day. The table needs about 620px, and from `md` the app shell's sidebar
 * takes 15rem, so below `lg` the content column is narrower than the table
 * and the grace minutes would sit off-screen in a sideways scroller.
 */
const WIDE_LAYOUT_QUERY = "(min-width: 1024px)";

function defaultDay(weekday: number): ScheduleDay {
  return {
    weekday,
    is_working_day: false,
    start_minute: 8 * 60,
    end_minute: 16 * 60,
    grace_minutes: 10,
  };
}

/**
 * One employee's working week: which days they work, from when to when,
 * and how many minutes late still count as on time. The board can only
 * judge an employee once this is set.
 */
export function ScheduleEditorView({ employees }: { employees: EmployeeOption[] }): ReactElement {
  const t = useTranslations("app.staffAttendance");
  const [employeeId, setEmployeeId] = useState("");

  return (
    <>
      <SectionHeader title={t("schedule.title")} description={t("schedule.subtitle")} />
      <Field label={t("schedule.employee")} className="sm:max-w-sm">
        <EmployeeCombobox employees={employees} value={employeeId} onValueChange={setEmployeeId} />
      </Field>

      {employeeId === "" ? (
        <EmptyState
          icon={<CalendarClock />}
          title={t("schedule.pickTitle")}
          description={t("schedule.pickBody")}
        />
      ) : (
        // Remounting per employeeId means each mount seeds its own local
        // form state exactly once from that employee's schedule, so
        // switching employees can never show a mix of two employees' data.
        <WeeklyScheduleForm key={employeeId} employeeId={employeeId} />
      )}
    </>
  );
}

function WeeklyScheduleForm({ employeeId }: { employeeId: string }): ReactElement {
  const t = useTranslations("app.staffAttendance");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canManage = useCan("manage_staff_attendance_schedules");

  const schedule = useStaffAttendanceScheduleQuery(employeeId);
  const replaceMutation = useReplaceStaffAttendanceScheduleMutation(employeeId);

  const [days, setDays] = useState<ScheduleDay[]>(WEEKDAYS.map(defaultDay));
  const [saved, setSaved] = useState<ScheduleDay[]>(WEEKDAYS.map(defaultDay));
  // Seeds `days` from the fetched schedule exactly once per mount (i.e. once
  // per employee, since this component is keyed by employeeId), set during
  // render rather than in an effect, per react-hooks/set-state-in-effect.
  const [seeded, setSeeded] = useState(false);
  // Whether the server holds a schedule for this person at all: the form
  // seeds an all-off week for someone who has none, which matches nothing
  // saved and must not read as "the schedule is saved".
  const [persisted, setPersisted] = useState(false);
  const loaded = schedule.data?.data;
  if (!seeded && loaded) {
    const seed = WEEKDAYS.map(
      (weekday) => loaded.find((d) => d.weekday === weekday) ?? defaultDay(weekday),
    );
    setSeeded(true);
    setDays(seed);
    setSaved(seed);
    setPersisted(loaded.length > 0);
  }
  const dirty = JSON.stringify(days) !== JSON.stringify(saved);
  const status = dirty
    ? t("schedule.unsaved")
    : persisted
      ? t("schedule.upToDate")
      : t("schedule.notSet");

  const wide = useMediaQuery(WIDE_LAYOUT_QUERY);

  function updateDay(weekday: number, patch: Partial<ScheduleDay>) {
    setDays((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
  }

  if (schedule.isLoading) return <SkeletonList rows={7} leading={false} />;
  if (schedule.isError && !loaded) {
    return <QueryError retry={() => schedule.refetch()} error={schedule.error} />;
  }

  // One day's controls, laid out as a table row from `lg` up and as a card
  // of labelled fields below it, where five columns do not fit and the
  // grace minutes would sit off-screen in a sideways scroller.
  function controlsFor(day: ScheduleDay) {
    const name = t(`schedule.weekdays.${day.weekday}`);
    const off = !canManage || !day.is_working_day;
    return {
      name,
      working: (
        <Switch
          checked={day.is_working_day}
          disabled={!canManage}
          aria-label={t("schedule.workingDayFor", { day: name })}
          onCheckedChange={(checked) => {
            updateDay(day.weekday, { is_working_day: checked });
          }}
        />
      ),
      start: (
        <TimePicker
          value={minutesToTimeInput(day.start_minute)}
          disabled={off}
          aria-label={t("schedule.startFor", { day: name })}
          onChange={(value) => {
            if (value) updateDay(day.weekday, { start_minute: timeInputToMinutes(value) });
          }}
          className="w-36"
        />
      ),
      end: (
        <TimePicker
          value={minutesToTimeInput(day.end_minute)}
          disabled={off}
          aria-label={t("schedule.endFor", { day: name })}
          onChange={(value) => {
            if (value) updateDay(day.weekday, { end_minute: timeInputToMinutes(value) });
          }}
          className="w-36"
        />
      ),
      grace: (
        <NumberInput
          value={day.grace_minutes}
          min={0}
          max={240}
          disabled={off}
          suffix={t("schedule.minutesUnit")}
          aria-label={t("schedule.graceFor", { day: name })}
          onChange={(value) => {
            updateDay(day.weekday, { grace_minutes: value ?? 0 });
          }}
          className="w-28"
        />
      ),
    };
  }

  return (
    <>
      {wide ? (
        <Table density="compact">
          <TableHeader>
            <TableRow>
              <TableHead>{t("schedule.day")}</TableHead>
              <TableHead>{t("schedule.isWorkingDay")}</TableHead>
              <TableHead>{t("schedule.start")}</TableHead>
              <TableHead>{t("schedule.end")}</TableHead>
              <TableHead>{t("schedule.grace")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.map((day) => {
              const controls = controlsFor(day);
              return (
                <TableRow key={day.weekday}>
                  <TableCell className="font-semibold text-fg">{controls.name}</TableCell>
                  <TableCell>{controls.working}</TableCell>
                  <TableCell>{controls.start}</TableCell>
                  <TableCell>{controls.end}</TableCell>
                  <TableCell>{controls.grace}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="schedule-day-cards">
          {days.map((day) => {
            const controls = controlsFor(day);
            return (
              <Card key={day.weekday} padding="md" className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-label text-fg">{controls.name}</span>
                  {controls.working}
                </div>
                {day.is_working_day && (
                  <div className="flex flex-wrap gap-3">
                    <Field label={t("schedule.start")}>{controls.start}</Field>
                    <Field label={t("schedule.end")}>{controls.end}</Field>
                    <Field label={t("schedule.grace")}>{controls.grace}</Field>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <p className="text-body-sm text-fg-muted">{t("schedule.endHint")}</p>
      {/* A save is never retroactive: the API judges every earlier day by
          the schedule in effect on it, so turning a day off keeps its past
          absences. Said before the save button, where the change is made. */}
      {canManage && <p className="text-body-sm text-fg-muted">{t("schedule.effectiveHint")}</p>}
      {canManage && (
        <FormActions align="between">
          <p className="text-body-sm text-fg-muted">{status}</p>
          <Button
            loading={replaceMutation.isPending}
            disabled={!dirty}
            onClick={() => {
              replaceMutation.mutate(days, {
                onSuccess: () => {
                  setSaved(days);
                  setPersisted(true);
                  toast.success(t("schedule.saved"));
                },
                onError: (error) => {
                  toast.error(
                    error instanceof ApiError
                      ? apiErrorMessage(error.code)
                      : apiErrorMessage("UNKNOWN"),
                  );
                },
              });
            }}
          >
            {t("schedule.save")}
          </Button>
        </FormActions>
      )}
    </>
  );
}
