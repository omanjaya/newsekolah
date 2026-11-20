"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Button,
  DatePicker,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  Field,
  useToast,
} from "@newsekolah/ui";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { formatCalendarDate } from "../../../lib/format-calendar-date";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { type ScheduleBlock, useDeleteScheduleBlockMutation } from "../api";
import { maxEffectiveFrom, minEffectiveFrom } from "../block-policy";
import { earliestEffectiveFromOf } from "../effective-error";
import { defaultEffectiveFrom } from "../week";

import type { EditorDates } from "./schedule-dialogs";

const LONG_DATE = {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
} as const;

/**
 * Removing a lesson that already has history: it leaves the timetable from
 * a date on ("Berlaku mulai"), while every lesson before that date keeps
 * its attendance, journals and substitutions. A dialog with its own field
 * rather than a plain confirmation, because the date is the decision.
 */
export function ScheduleRetireDialog({
  block,
  name,
  dates,
  onClose,
}: {
  /** The block being removed; null closes the dialog. */
  block: ScheduleBlock | null;
  /** The lesson as the reader knows it, "Matematika, X-A, Senin". */
  name: string;
  dates: EditorDates;
  onClose: () => void;
}): ReactElement {
  const t = useTranslations("app.schedule");
  const tForm = useTranslations("app.schedule.form");
  return (
    <Dialog
      open={block !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent title={t("retireTitle")} description={t("retireBody", { lesson: name })}>
        {block && (
          <RetireForm block={block} dates={dates} onClose={onClose} cancelLabel={tForm("cancel")} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RetireForm({
  block,
  dates,
  onClose,
  cancelLabel,
}: {
  block: ScheduleBlock;
  dates: EditorDates;
  onClose: () => void;
  cancelLabel: string;
}): ReactElement {
  const t = useTranslations("app.schedule");
  const tForm = useTranslations("app.schedule.form");
  const format = useFormatter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const remove = useDeleteScheduleBlockMutation();
  const [min, setMin] = useState(minEffectiveFrom(block));
  // A block already removed from a later date ends there: no later date
  // would change anything.
  const max = maxEffectiveFrom(block, dates.yearEnd);
  const [date, setDate] = useState(() =>
    defaultEffectiveFrom({
      today: dates.today,
      preferred: dates.weekStart,
      yearStart: dates.yearStart,
      yearEnd: max,
      min: minEffectiveFrom(block),
    }),
  );
  const [error, setError] = useState<string | null>(null);
  const showDate = (iso: string) => formatCalendarDate(format, iso, LONG_DATE);

  async function confirm() {
    setError(null);
    try {
      await remove.mutateAsync({ scheduleIds: block.schedule_ids, effectiveFrom: date });
      toast.success(t("retired", { date: showDate(date) }));
      onClose();
    } catch (err) {
      const earliest = earliestEffectiveFromOf(err);
      if (earliest) {
        setMin(earliest);
        setDate(earliest);
      }
      const message =
        err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN");
      setError(
        earliest
          ? `${message} ${tForm("effectiveFromHintDated", { date: showDate(earliest) })}`
          : message,
      );
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void confirm();
      }}
    >
      {error && <Alert variant="danger">{error}</Alert>}
      <Field
        label={tForm("effectiveFrom")}
        required
        hint={min ? tForm("effectiveFromHintDated", { date: showDate(min) }) : undefined}
      >
        <DatePicker
          value={date}
          onChange={(next) => {
            if (next) setDate(next);
          }}
          min={min}
          max={max}
          today={dates.today}
          clearable={false}
          required
        />
      </Field>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="secondary" disabled={remove.isPending}>
            {cancelLabel}
          </Button>
        </DialogClose>
        <Button type="submit" variant="danger" loading={remove.isPending}>
          {t("retireConfirm")}
        </Button>
      </DialogFooter>
    </form>
  );
}
