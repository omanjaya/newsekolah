"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Checkbox, Dialog, DialogContent, Input, Textarea, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type AttendanceRecord, useCorrectStaffAttendanceRecordMutation } from "../api";
import { dateTimeLocalToIso, isoToDateTimeLocal } from "../time";

export function CorrectionDialog({
  record,
  onOpenChange,
}: {
  record: AttendanceRecord | null;
  onOpenChange: (open: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.staffAttendance.correction");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const mutation = useCorrectStaffAttendanceRecordMutation();

  const [arrival, setArrival] = useState("");
  const [clearArrival, setClearArrival] = useState(false);
  const [departure, setDeparture] = useState("");
  const [clearDeparture, setClearDeparture] = useState(false);
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [attemptedSave, setAttemptedSave] = useState(false);
  // Tracks which record the form fields were last seeded from, so opening
  // the dialog on a new record re-seeds the form exactly once -- set during
  // render rather than in an effect, per react-hooks/set-state-in-effect
  // (same pattern as features/messaging/components/provider-config-view.tsx).
  const [seededFrom, setSeededFrom] = useState<AttendanceRecord | null>(null);

  if (record && record !== seededFrom) {
    setSeededFrom(record);
    setArrival(isoToDateTimeLocal(record.arrival_at));
    setClearArrival(false);
    setDeparture(isoToDateTimeLocal(record.departure_at));
    setClearDeparture(false);
    setNotes(record.notes ?? "");
    setReason("");
    setAttemptedSave(false);
  }

  return (
    <Dialog
      open={record !== null}
      onOpenChange={(open) => {
        onOpenChange(open);
      }}
    >
      <DialogContent
        title={t("title")}
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t("cancel")}
            </Button>
            <Button
              size="sm"
              loading={mutation.isPending}
              disabled={reason.trim() === ""}
              onClick={() => {
                setAttemptedSave(true);
                if (!record?.record_id || reason.trim() === "") return;
                mutation.mutate(
                  {
                    recordId: record.record_id,
                    body: {
                      arrival_at: clearArrival ? null : dateTimeLocalToIso(arrival),
                      clear_arrival: clearArrival,
                      departure_at: clearDeparture ? null : dateTimeLocalToIso(departure),
                      clear_departure: clearDeparture,
                      notes,
                      reason: reason.trim(),
                    },
                  },
                  {
                    onSuccess: () => {
                      toast.success(t("saved"));
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
              {t("save")}
            </Button>
          </>
        }
      >
        {record && (
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-fg-muted">{t("body")}</p>
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="font-medium">{t("arrival")}</span>
                <Input
                  type="datetime-local"
                  value={arrival}
                  disabled={clearArrival}
                  onChange={(e) => {
                    setArrival(e.target.value);
                  }}
                />
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <Checkbox
                  checked={clearArrival}
                  onCheckedChange={(checked) => {
                    setClearArrival(checked === true);
                  }}
                />
                {t("clearArrival")}
              </label>
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="font-medium">{t("departure")}</span>
                <Input
                  type="datetime-local"
                  value={departure}
                  disabled={clearDeparture}
                  onChange={(e) => {
                    setDeparture(e.target.value);
                  }}
                />
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <Checkbox
                  checked={clearDeparture}
                  onCheckedChange={(checked) => {
                    setClearDeparture(checked === true);
                  }}
                />
                {t("clearDeparture")}
              </label>
            </div>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("notes")}</span>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                }}
                maxLength={500}
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("reason")}</span>
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                }}
                maxLength={500}
              />
              {attemptedSave && reason.trim() === "" && (
                <span className="text-[12px] text-status-absent">{t("reasonRequired")}</span>
              )}
            </label>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
