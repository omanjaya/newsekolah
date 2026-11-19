"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  Field,
  FormSection,
  Textarea,
  TimePicker,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { type Employee, useRecordStaffAttendanceManualMutation } from "../api";
import { schoolInstant, shiftDateISO } from "../time";

import { EmployeeCombobox } from "./employee-combobox";

/**
 * Records a day for an employee by hand: who, which day, and the arrival
 * and departure on the school's clock, each optional. The date is asked
 * once; a departure earlier than the arrival is read as the next morning
 * (a night shift).
 */
export function ManualEntryDialog({
  open,
  onOpenChange,
  employees,
  defaultDate,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  defaultDate: string;
  today: string;
}): ReactElement {
  const t = useTranslations("app.staffAttendance");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const timeZone = useSession().me?.tenant.timezone;
  const mutation = useRecordStaffAttendanceManualMutation();

  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [arrival, setArrival] = useState("");
  const [departure, setDeparture] = useState("");
  const [notes, setNotes] = useState("");
  const [attempted, setAttempted] = useState(false);

  const overnight = arrival !== "" && departure !== "" && departure < arrival;
  const errors = {
    employee: employeeId === "" ? t("manualForm.errors.employee") : undefined,
    date: date === "" ? t("manualForm.errors.date") : undefined,
  };

  function reset() {
    setEmployeeId("");
    setDate(defaultDate);
    setArrival("");
    setDeparture("");
    setNotes("");
    setAttempted(false);
  }

  function close() {
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent
        title={t("manualForm.title")}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t("manualForm.cancel")}
            </Button>
            <Button
              loading={mutation.isPending}
              onClick={() => {
                setAttempted(true);
                if (errors.employee || errors.date) return;
                mutation.mutate(
                  {
                    employee_user_id: employeeId,
                    date,
                    arrival_at: schoolInstant(date, arrival, timeZone),
                    departure_at: schoolInstant(
                      overnight ? shiftDateISO(date, 1) : date,
                      departure,
                      timeZone,
                    ),
                    notes,
                  },
                  {
                    onSuccess: () => {
                      toast.success(t("manualForm.saved"));
                      close();
                    },
                    onError: (error) => {
                      toast.error(
                        error instanceof ApiError
                          ? apiErrorMessage(error.code)
                          : apiErrorMessage("UNKNOWN"),
                      );
                    },
                  },
                );
              }}
            >
              {t("manualForm.save")}
            </Button>
          </>
        }
      >
        <FormSection columns={1}>
          <Field
            label={t("manualForm.employee")}
            required
            error={attempted ? errors.employee : undefined}
          >
            <EmployeeCombobox
              employees={employees}
              value={employeeId}
              onValueChange={setEmployeeId}
            />
          </Field>
          <Field label={t("manualForm.date")} required error={attempted ? errors.date : undefined}>
            <DatePicker value={date} onChange={setDate} max={today} today={today} required />
          </Field>
          <Field
            label={t("manualForm.hours")}
            hint={overnight ? t("manualForm.overnightHint") : t("manualForm.hoursHint")}
          >
            {(control) => (
              // Side by side from 640px; on a phone the sheet is too narrow
              // for two pickers to show their placeholders whole.
              <div
                role="group"
                aria-labelledby={control.labelId}
                aria-describedby={control["aria-describedby"]}
                className="grid gap-2 sm:grid-cols-2"
              >
                <TimePicker
                  value={arrival}
                  onChange={setArrival}
                  aria-label={t("manualForm.arrival")}
                  placeholder={t("manualForm.arrival")}
                />
                <TimePicker
                  value={departure}
                  onChange={setDeparture}
                  aria-label={t("manualForm.departure")}
                  placeholder={t("manualForm.departure")}
                />
              </div>
            )}
          </Field>
          <Field label={t("manualForm.notes")} optional>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
              }}
              maxLength={500}
            />
          </Field>
        </FormSection>
      </DialogContent>
    </Dialog>
  );
}
