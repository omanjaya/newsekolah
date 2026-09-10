"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, EmptyState, Input, Select, Switch, useToast } from "@newsekolah/ui";
import { CalendarClock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type Employee,
  type ScheduleDay,
  useReplaceStaffAttendanceScheduleMutation,
  useStaffAttendanceScheduleQuery,
} from "../api";
import { minutesToTimeInput, timeInputToMinutes } from "../time";

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

export function ScheduleEditorView({ employees }: { employees: Employee[] }): ReactElement {
  const t = useTranslations("app.staffAttendance");
  const [employeeId, setEmployeeId] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[15px] font-medium text-fg">{t("schedule.title")}</h2>
        <p className="text-[13px] text-fg-muted">{t("schedule.subtitle")}</p>
      </div>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium text-fg">{t("schedule.employee")}</span>
        <Select
          options={employees.map((e) => ({ value: e.id, label: e.name }))}
          value={employeeId}
          onValueChange={setEmployeeId}
          placeholder={t("schedule.employeePlaceholder")}
          className="w-72"
        />
      </label>

      {employeeId === "" ? (
        <EmptyState
          icon={<CalendarClock aria-hidden="true" />}
          title={t("schedule.employeePlaceholder")}
        />
      ) : (
        // Remounting per employeeId means each mount seeds its own local
        // form state exactly once from that employee's schedule, so
        // switching employees can never show a mix of two employees' data.
        <WeeklyScheduleForm key={employeeId} employeeId={employeeId} />
      )}
    </div>
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
  // Seeds `days` from the fetched schedule exactly once per mount (i.e. once
  // per employee, since this component is keyed by employeeId), set during
  // render rather than in an effect, per react-hooks/set-state-in-effect.
  const [seeded, setSeeded] = useState(false);
  const loaded = schedule.data?.data;
  if (!seeded && loaded) {
    setSeeded(true);
    setDays(
      WEEKDAYS.map((weekday) => loaded.find((d) => d.weekday === weekday) ?? defaultDay(weekday)),
    );
  }

  function updateDay(weekday: number, patch: Partial<ScheduleDay>) {
    setDays((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
  }

  return (
    <div className="flex flex-col gap-3">
      {days.map((day) => (
        <div
          key={day.weekday}
          className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3"
        >
          <span className="w-24 text-[13px] font-medium text-fg">
            {t(`schedule.weekdays.${day.weekday}`)}
          </span>
          <label className="flex items-center gap-2 text-[13px]">
            <Switch
              checked={day.is_working_day}
              disabled={!canManage}
              onCheckedChange={(checked) => {
                updateDay(day.weekday, { is_working_day: checked });
              }}
            />
            {t("schedule.isWorkingDay")}
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="text-fg-muted">{t("schedule.start")}</span>
            <Input
              type="time"
              value={minutesToTimeInput(day.start_minute)}
              disabled={!canManage || !day.is_working_day}
              onChange={(e) => {
                updateDay(day.weekday, { start_minute: timeInputToMinutes(e.target.value) });
              }}
              className="w-28"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="text-fg-muted">{t("schedule.end")}</span>
            <Input
              type="time"
              value={minutesToTimeInput(day.end_minute)}
              disabled={!canManage || !day.is_working_day}
              onChange={(e) => {
                updateDay(day.weekday, { end_minute: timeInputToMinutes(e.target.value) });
              }}
              className="w-28"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="text-fg-muted">{t("schedule.grace")}</span>
            <Input
              type="number"
              min={0}
              value={day.grace_minutes}
              disabled={!canManage || !day.is_working_day}
              onChange={(e) => {
                updateDay(day.weekday, { grace_minutes: Number(e.target.value) || 0 });
              }}
              className="w-20"
            />
          </label>
        </div>
      ))}
      <p className="text-[12px] text-fg-muted">{t("schedule.endHint")}</p>
      {canManage && (
        <Button
          size="sm"
          className="self-start"
          loading={replaceMutation.isPending}
          onClick={() => {
            replaceMutation.mutate(days, {
              onSuccess: () => {
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
      )}
    </div>
  );
}
