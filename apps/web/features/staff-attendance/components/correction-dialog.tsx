"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Checkbox,
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
import { type AttendanceRecord, useCorrectStaffAttendanceRecordMutation } from "../api";
import { schoolClock, schoolInstant, shiftDateISO } from "../time";

/**
 * Corrects one day's record: its arrival and departure on the school's
 * clock (either can be cleared), its note, and the reason, which is
 * required and kept with the correction.
 */
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
  const timeZone = useSession().me?.tenant.timezone;
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
    setArrival(schoolClock(record.arrival_at, timeZone));
    setClearArrival(false);
    setDeparture(schoolClock(record.departure_at, timeZone));
    setClearDeparture(false);
    setNotes(record.notes ?? "");
    setReason("");
    setAttemptedSave(false);
  }

  const overnight = arrival !== "" && departure !== "" && departure < arrival;

  return (
    <Dialog open={record !== null} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("title")}
        description={record ? t("bodyFor", { name: record.employee_name }) : undefined}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              {t("cancel")}
            </Button>
            <Button
              loading={mutation.isPending}
              onClick={() => {
                setAttemptedSave(true);
                if (!record?.record_id || reason.trim() === "") return;
                mutation.mutate(
                  {
                    recordId: record.record_id,
                    body: {
                      arrival_at: clearArrival
                        ? null
                        : schoolInstant(record.date, arrival, timeZone),
                      clear_arrival: clearArrival,
                      departure_at: clearDeparture
                        ? null
                        : schoolInstant(
                            overnight ? shiftDateISO(record.date, 1) : record.date,
                            departure,
                            timeZone,
                          ),
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
          <FormSection columns={1}>
            <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
              <div className="flex flex-col gap-3">
                <Field label={t("arrival")} disabled={clearArrival}>
                  <TimePicker value={arrival} onChange={setArrival} disabled={clearArrival} />
                </Field>
                <Checkbox
                  checked={clearArrival}
                  label={t("clearArrival")}
                  onCheckedChange={(checked) => {
                    setClearArrival(checked === true);
                  }}
                />
              </div>
              <div className="flex flex-col gap-3">
                <Field
                  label={t("departure")}
                  disabled={clearDeparture}
                  hint={overnight && !clearDeparture ? t("overnightHint") : undefined}
                >
                  <TimePicker value={departure} onChange={setDeparture} disabled={clearDeparture} />
                </Field>
                <Checkbox
                  checked={clearDeparture}
                  label={t("clearDeparture")}
                  onCheckedChange={(checked) => {
                    setClearDeparture(checked === true);
                  }}
                />
              </div>
            </div>
            <Field label={t("notes")} optional>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                }}
                maxLength={500}
              />
            </Field>
            <Field
              label={t("reason")}
              required
              hint={t("body")}
              error={attemptedSave && reason.trim() === "" ? t("reasonRequired") : undefined}
            >
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                }}
                maxLength={500}
              />
            </Field>
          </FormSection>
        )}
      </DialogContent>
    </Dialog>
  );
}
