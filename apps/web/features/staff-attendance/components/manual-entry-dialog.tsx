"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Dialog, DialogContent, Input, Select, Textarea, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type Employee, useRecordStaffAttendanceManualMutation } from "../api";
import { dateTimeLocalToIso } from "../time";

export function ManualEntryDialog({
  open,
  onOpenChange,
  employees,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  defaultDate: string;
}): ReactElement {
  const t = useTranslations("app.staffAttendance");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const mutation = useRecordStaffAttendanceManualMutation();

  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [arrival, setArrival] = useState("");
  const [departure, setDeparture] = useState("");
  const [notes, setNotes] = useState("");

  function reset() {
    setEmployeeId("");
    setDate(defaultDate);
    setArrival("");
    setDeparture("");
    setNotes("");
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t("manualForm.cancel")}
            </Button>
            <Button
              size="sm"
              loading={mutation.isPending}
              disabled={employeeId === "" || date === ""}
              onClick={() => {
                mutation.mutate(
                  {
                    employee_user_id: employeeId,
                    date,
                    arrival_at: dateTimeLocalToIso(arrival),
                    departure_at: dateTimeLocalToIso(departure),
                    notes,
                  },
                  {
                    onSuccess: () => {
                      toast.success(t("manualForm.saved"));
                      reset();
                      onOpenChange(false);
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
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("manualForm.employee")}</span>
            <Select
              options={employees.map((e) => ({ value: e.id, label: e.name }))}
              value={employeeId}
              onValueChange={setEmployeeId}
              placeholder={t("manualForm.employeePlaceholder")}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("manualForm.date")}</span>
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("manualForm.arrival")}</span>
            <Input
              type="datetime-local"
              value={arrival}
              onChange={(e) => {
                setArrival(e.target.value);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("manualForm.departure")}</span>
            <Input
              type="datetime-local"
              value={departure}
              onChange={(e) => {
                setDeparture(e.target.value);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("manualForm.notes")}</span>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
              }}
              maxLength={500}
            />
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}
