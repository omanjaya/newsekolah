"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatTime } from "@newsekolah/i18n";
import { Alert, Button, Input, StickySaveBar, Textarea, useToast } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useUnsavedChangesProtection } from "../../../lib/navigation/use-unsaved-changes-protection";
import { useSession } from "../../../lib/session/session-provider";
import {
  type ScheduledObservation,
  type SupervisionInstrument,
  useCompleteObservationMutation,
} from "../api";
import {
  clearObservationDraft,
  loadObservationDraft,
  saveObservationDraft,
} from "../lib/observation-draft";

import { ObservationScoreControl } from "./observation-score-control";

function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Scores a scheduled observation against its cycle's instrument. Every
 * criterion needs exactly one score in range, matching
 * `domain.Instrument.ValidateScores` on the server. Built for a tablet or
 * phone in hand during the lesson itself: large tap targets, a sticky save
 * bar that always shows how many criteria are left, and an autosaved draft
 * so a dropped connection or an accidental reload never throws away a
 * live observation.
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
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { me } = useSession();
  const complete = useCompleteObservationMutation();

  const initialScores = Object.fromEntries(instrument.criteria.map((c) => [c.key, ""]));

  const [scores, setScores] = useState<Record<string, string>>(initialScores);
  const [observerNotes, setObserverNotes] = useState("");
  const [observedAt, setObservedAt] = useState(nowLocal());
  const [formError, setFormError] = useState<string | null>(null);
  const [savedSuccessfully, setSavedSuccessfully] = useState(false);
  const [draftOffer, setDraftOffer] = useState<{ savedAt: string } | null>(null);

  // Offer to restore an in-progress draft the browser still has from
  // before a reload or a dropped connection, once per mount. This reads
  // `window.localStorage`, which does not exist during server rendering,
  // so it cannot move into a lazy `useState` initializer the way a
  // server-safe value could -- the effect is the deliberate, correct way
  // to reach it only after the client has mounted.
  useEffect(() => {
    const draft = loadObservationDraft(scheduled.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see the comment above.
    if (draft) setDraftOffer({ savedAt: draft.savedAt });
  }, [scheduled.id]);

  const scoredCriteria = instrument.criteria.filter((c) => {
    const value = Number.parseInt(scores[c.key] ?? "", 10);
    return Number.isFinite(value) && value >= instrument.scale_min && value <= instrument.scale_max;
  });
  const totalCriteria = instrument.criteria.length;
  const allScored = scoredCriteria.length === totalCriteria;
  const canSubmit = allScored && observerNotes.trim() !== "" && observedAt !== "";

  const isDirty = scoredCriteria.length > 0 || observerNotes.trim() !== "";
  useUnsavedChangesProtection(isDirty && !savedSuccessfully, t("discardChanges"));

  // Mirrors every edit to localStorage (try/catch inside the helper) so a
  // dropped classroom connection or an accidental reload does not throw
  // away scoring already in memory; cleared the moment a save succeeds.
  useEffect(() => {
    if (!isDirty) return;
    saveObservationDraft(scheduled.id, { scores, observerNotes, observedAt });
  }, [scheduled.id, scores, observerNotes, observedAt, isDirty]);

  function setScore(criterionKey: string, score: number) {
    setScores((prev) => ({ ...prev, [criterionKey]: String(score) }));
  }

  function restoreDraft() {
    const draft = loadObservationDraft(scheduled.id);
    if (!draft) return;
    setScores((prev) => ({ ...prev, ...draft.scores }));
    setObserverNotes(draft.observerNotes);
    setObservedAt(draft.observedAt);
    setDraftOffer(null);
  }

  function dismissDraft() {
    clearObservationDraft(scheduled.id);
    setDraftOffer(null);
  }

  async function submit() {
    setFormError(null);
    if (!canSubmit) return;
    try {
      await complete.mutateAsync({
        scheduled_id: scheduled.id,
        scores: instrument.criteria.map((c) => ({
          criterion_key: c.key,
          score: Number.parseInt(scores[c.key] ?? "0", 10),
        })),
        observer_notes: observerNotes.trim(),
        observed_at: new Date(observedAt).toISOString(),
      });
      setSavedSuccessfully(true);
      clearObservationDraft(scheduled.id);
      toast.success(
        t("savedAt", { time: formatTime(new Date(), { locale, timeZone: me?.tenant.timezone }) }),
      );
      onDone();
    } catch (error) {
      setFormError(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {draftOffer && (
        <Alert variant="warning" title={t("draftFoundTitle")}>
          <p>
            {t("draftFoundBody", {
              time: formatTime(draftOffer.savedAt, { locale, timeZone: me?.tenant.timezone }),
            })}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={restoreDraft}>
              {t("draftRestore")}
            </Button>
            <Button size="sm" variant="secondary" onClick={dismissDraft}>
              {t("draftDismiss")}
            </Button>
          </div>
        </Alert>
      )}

      <div className="flex flex-col gap-1 rounded-sm border border-border bg-surface p-4">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("observedAt")}</span>
          <Input
            type="datetime-local"
            value={observedAt}
            onChange={(e) => {
              setObservedAt(e.target.value);
            }}
            disabled={complete.isPending}
            className="max-w-xs"
            required
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[16px] font-medium">{t("scoresHeading")}</h2>
          <p className="text-[13px] text-fg-muted">
            {t("scoresHint", { min: instrument.scale_min, max: instrument.scale_max })}
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-border rounded-sm border border-border bg-surface">
          {instrument.criteria.map((c) => {
            const raw = scores[c.key] ?? "";
            const value = raw === "" ? null : Number.parseInt(raw, 10);
            return (
              <li
                key={c.key}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <span className="text-[13px] font-medium">{c.name}</span>
                <ObservationScoreControl
                  min={instrument.scale_min}
                  max={instrument.scale_max}
                  value={Number.isFinite(value) ? value : null}
                  label={c.name}
                  disabled={complete.isPending}
                  onChange={(score) => {
                    setScore(c.key, score);
                  }}
                />
              </li>
            );
          })}
        </ul>
      </div>

      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("observerNotes")}</span>
        <Textarea
          rows={5}
          value={observerNotes}
          onChange={(e) => {
            setObserverNotes(e.target.value);
          }}
          placeholder={t("observerNotesPlaceholder")}
          disabled={complete.isPending}
          required
        />
      </label>

      <StickySaveBar
        leadingSlot={
          <span className="text-[13px] text-fg-muted">
            {t("progress", { scored: scoredCriteria.length, total: totalCriteria })}
          </span>
        }
        trailingSlot={
          formError && (
            <span role="alert" className="flex items-center gap-2 text-[13px] text-status-absent">
              {formError}
              <button type="button" className="font-medium underline" onClick={() => void submit()}>
                {t("retry")}
              </button>
            </span>
          )
        }
        saveLabel={t("submit")}
        saving={complete.isPending}
        disabled={!canSubmit}
        onSave={() => void submit()}
      />
    </div>
  );
}
