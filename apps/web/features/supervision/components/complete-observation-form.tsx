"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Textarea, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type ScheduledObservation,
  type SupervisionInstrument,
  useCompleteObservationMutation,
} from "../api";

function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Scores a scheduled observation against its cycle's instrument. Every
 * criterion needs exactly one score in range, matching
 * `domain.Instrument.ValidateScores` on the server.
 */
export function CompleteObservationForm({
  scheduled,
  instrument,
  onDone,
}: {
  scheduled: ScheduledObservation;
  instrument: SupervisionInstrument;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.supervision.observationForm");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const complete = useCompleteObservationMutation();

  const [scores, setScores] = useState<Record<string, string>>(
    Object.fromEntries(instrument.criteria.map((c) => [c.key, ""])),
  );
  const [observerNotes, setObserverNotes] = useState("");
  const [observedAt, setObservedAt] = useState(nowLocal());

  const allScored = instrument.criteria.every((c) => {
    const value = Number.parseInt(scores[c.key] ?? "", 10);
    return Number.isFinite(value) && value >= instrument.scale_min && value <= instrument.scale_max;
  });
  const canSubmit = allScored && observerNotes.trim() !== "" && observedAt !== "";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        complete.mutate(
          {
            scheduled_id: scheduled.id,
            scores: instrument.criteria.map((c) => ({
              criterion_key: c.key,
              score: Number.parseInt(scores[c.key] ?? "0", 10),
            })),
            observer_notes: observerNotes.trim(),
            observed_at: new Date(observedAt).toISOString(),
          },
          {
            onSuccess: () => {
              toast.success(t("saved"));
              onDone();
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
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("observedAt")}</span>
        <Input
          type="datetime-local"
          value={observedAt}
          onChange={(e) => {
            setObservedAt(e.target.value);
          }}
          required
        />
      </label>

      <fieldset className="flex flex-col gap-2 text-[13px]">
        <legend className="font-medium">
          {t("scores", { min: instrument.scale_min, max: instrument.scale_max })}
        </legend>
        {instrument.criteria.map((c) => (
          <label key={c.key} className="flex items-center justify-between gap-3">
            <span>{c.name}</span>
            <Input
              type="number"
              min={instrument.scale_min}
              max={instrument.scale_max}
              value={scores[c.key] ?? ""}
              onChange={(e) => {
                setScores((prev) => ({ ...prev, [c.key]: e.target.value }));
              }}
              className="w-20"
              required
            />
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("observerNotes")}</span>
        <Textarea
          rows={5}
          value={observerNotes}
          onChange={(e) => {
            setObserverNotes(e.target.value);
          }}
          placeholder={t("observerNotesPlaceholder")}
          required
        />
      </label>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={complete.isPending} disabled={!canSubmit}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
