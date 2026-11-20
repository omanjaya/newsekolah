"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DatePicker,
  Dialog,
  DialogClose,
  DialogContent,
  Field,
  Input,
  useToast,
} from "@newsekolah/ui";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { formatCalendarDate } from "../../../lib/format-calendar-date";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { useClearSchedulesMutation, useScheduleYearQuery } from "../api";
import { earliestEffectiveFromOf } from "../effective-error";
import { defaultEffectiveFrom } from "../week";

const LONG_DATE = {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
} as const;

/**
 * A typed confirmation (the exact academic year name) instead of a plain
 * yes/no dialog, per docs/07-ui-ux.md: an irreversible bulk delete needs
 * more friction than a normal confirm. The timetable is effective-dated,
 * so it is cleared from a date on ("Berlaku mulai", today by default):
 * every earlier week keeps its lessons and the attendance recorded for
 * them, and a new timetable can be imported from the same date.
 */
export function ClearSchedulesSection({
  academicYearId,
  yearLabel,
}: {
  academicYearId: string;
  yearLabel: string;
}): ReactElement {
  const t = useTranslations("app.schedule.bulk.clearSection");
  const tForm = useTranslations("app.schedule.form");
  const format = useFormatter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const clearSchedules = useClearSchedulesMutation();
  const { me } = useSession();
  const today = todayInZone(me?.tenant.timezone);
  const yearSpan = useScheduleYearQuery(academicYearId, true);
  const yearStart = yearSpan.data?.starts_on;
  const yearEnd = yearSpan.data?.ends_on;

  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  // Null until the reader picks one: the default follows today and the year.
  const [pickedFrom, setPickedFrom] = useState<string | null>(null);
  const [min, setMin] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const effectiveFrom = pickedFrom ?? defaultEffectiveFrom({ today, yearStart, yearEnd, min });
  const canConfirm = confirmText.trim() === yearLabel && yearLabel !== "" && effectiveFrom !== "";
  const showDate = (iso: string) => formatCalendarDate(format, iso, LONG_DATE);

  function close() {
    setOpen(false);
    setConfirmText("");
    setPickedFrom(null);
    setMin(undefined);
    setError(null);
  }

  function handleConfirm() {
    setError(null);
    clearSchedules.mutate(
      { academicYearId, effectiveFrom },
      {
        onSuccess: () => {
          toast.success(t("cleared", { year: yearLabel, date: showDate(effectiveFrom) }));
          close();
        },
        onError: (err) => {
          // A date on or before something recorded: offer the earliest one.
          const earliest = earliestEffectiveFromOf(err);
          if (earliest) {
            setMin(earliest);
            setPickedFrom(earliest);
          }
          const message =
            err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN");
          setError(
            earliest
              ? `${message} ${tForm("effectiveFromHintDated", { date: showDate(earliest) })}`
              : message,
          );
        },
      },
    );
  }

  return (
    // The danger zone: set apart at the end of the page, edged in danger.
    <Card className="border-danger/40">
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
        <CardDescription>{t("body", { year: yearLabel })}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button
          variant="danger"
          disabled={yearLabel === ""}
          onClick={() => {
            setOpen(true);
          }}
        >
          {t("button")}
        </Button>
      </CardFooter>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) {
            setOpen(true);
            return;
          }
          close();
        }}
      >
        <DialogContent
          title={t("confirmTitle", { year: yearLabel })}
          description={t("confirmBody", { year: yearLabel })}
          footer={
            <>
              <DialogClose asChild>
                <Button variant="secondary">{t("cancel")}</Button>
              </DialogClose>
              <Button
                variant="danger"
                disabled={!canConfirm}
                loading={clearSchedules.isPending}
                onClick={handleConfirm}
              >
                {t("confirmButton")}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            {error && <Alert variant="danger">{error}</Alert>}
            <Field label={tForm("effectiveFrom")} required hint={t("effectiveFromHint")}>
              <DatePicker
                value={effectiveFrom}
                onChange={(next) => {
                  if (next) setPickedFrom(next);
                }}
                min={min ?? yearStart}
                max={yearEnd}
                today={today}
                clearable={false}
                required
              />
            </Field>
            <Field label={t("confirmInputLabel", { year: yearLabel })}>
              <Input
                value={confirmText}
                onChange={(e) => {
                  setConfirmText(e.target.value);
                }}
                autoComplete="off"
              />
            </Field>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
