"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
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
  type Employee,
  type ScheduleDay,
  useReplaceStaffAttendanceScheduleMutation,
  useStaffAttendanceScheduleQuery,
} from "../api";
import { minutesToTimeInput, timeInputToMinutes } from "../time";

import { EmployeeCombobox } from "./employee-combobox";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

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
export function ScheduleEditorView({ employees }: { employees: Employee[] }): ReactElement {
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
  const loaded = schedule.data?.data;
  if (!seeded && loaded) {
    const seed = WEEKDAYS.map(
      (weekday) => loaded.find((d) => d.weekday === weekday) ?? defaultDay(weekday),
    );
    setSeeded(true);
    setDays(seed);
    setSaved(seed);
  }
  const dirty = JSON.stringify(days) !== JSON.stringify(saved);

  function updateDay(weekday: number, patch: Partial<ScheduleDay>) {
    setDays((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
  }

  if (schedule.isLoading) return <SkeletonList rows={7} leading={false} />;
  if (schedule.isError && !loaded) {
    return <QueryError retry={() => schedule.refetch()} error={schedule.error} />;
  }

  return (
    <>
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
            const name = t(`schedule.weekdays.${day.weekday}`);
            const off = !canManage || !day.is_working_day;
            return (
              <TableRow key={day.weekday}>
                <TableCell className="font-semibold text-fg">{name}</TableCell>
                <TableCell>
                  <Switch
                    checked={day.is_working_day}
                    disabled={!canManage}
                    aria-label={t("schedule.workingDayFor", { day: name })}
                    onCheckedChange={(checked) => {
                      updateDay(day.weekday, { is_working_day: checked });
                    }}
                  />
                </TableCell>
                <TableCell>
                  <TimePicker
                    value={minutesToTimeInput(day.start_minute)}
                    disabled={off}
                    aria-label={t("schedule.startFor", { day: name })}
                    onChange={(value) => {
                      if (value)
                        updateDay(day.weekday, { start_minute: timeInputToMinutes(value) });
                    }}
                    className="w-28"
                  />
                </TableCell>
                <TableCell>
                  <TimePicker
                    value={minutesToTimeInput(day.end_minute)}
                    disabled={off}
                    aria-label={t("schedule.endFor", { day: name })}
                    onChange={(value) => {
                      if (value) updateDay(day.weekday, { end_minute: timeInputToMinutes(value) });
                    }}
                    className="w-28"
                  />
                </TableCell>
                <TableCell>
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
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="text-body-sm text-fg-muted">{t("schedule.endHint")}</p>
      {canManage && (
        <FormActions align="between">
          <p className="text-body-sm text-fg-muted">
            {dirty ? t("schedule.unsaved") : t("schedule.upToDate")}
          </p>
          <Button
            loading={replaceMutation.isPending}
            disabled={!dirty}
            onClick={() => {
              replaceMutation.mutate(days, {
                onSuccess: () => {
                  setSaved(days);
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
