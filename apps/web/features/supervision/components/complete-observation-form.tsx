"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatTime } from "@newsekolah/i18n";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DatePicker,
  Field,
  StickySaveBar,
  Textarea,
  TimePicker,
  useToast,
  type BreadcrumbItem,
} from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useDraftOwner } from "../../../lib/drafts/draft-owner";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useUnsavedChangesProtection } from "../../../lib/navigation/use-unsaved-changes-protection";
import { useSession } from "../../../lib/session/session-provider";
import { businessNow, instantFromSchoolTime, schoolDateTime } from "../../../lib/simulation/clock";
import { toDateTimeLocalValue } from "../../../lib/tenant-date";
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
import { formatScore } from "../lib/score-format";

import { ObservationScoreControl } from "./observation-score-control";

/** "YYYY-MM-DDTHH:mm" on the school's clock (the browser's while the school's is unknown). */
function nowValue(timeZone?: string): string {
  const now = businessNow();
  if (!timeZone) return toDateTimeLocalValue(now);
  const { date, time } = schoolDateTime(now, timeZone);
  return `${date}T${time}`;
}

/** The instant a "YYYY-MM-DDTHH:mm" value stands for on the school's clock. */
function toInstant(value: string, timeZone?: string): Date | null {
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  if (date.length !== 10 || time.length !== 5) return null;
  const instant = timeZone ? instantFromSchoolTime(date, time, timeZone) : new Date(value);
  return instant && !Number.isNaN(instant.getTime()) ? instant : null;
}

/**
 * Scores a scheduled observation against its cycle's instrument, as its
 * own page: the header names the teacher and the lesson, then when it was
 * observed, every criterion numbered with its score, and the notes. Every
 * criterion needs exactly one score in range, matching
 * `domain.Instrument.ValidateScores` on the server. Built for a tablet or
 * phone in hand during the lesson itself: large tap targets, a sticky save
 * bar that always shows how many criteria are left and the running
 * average, and an autosaved draft so a dropped connection or an accidental
 * reload never throws away a live observation.
 */
export function CompleteObservationForm({
  scheduled,
  instrument,
  title,
  description,
  breadcrumb,
  onDone,
}: {
  scheduled: ScheduledObservation;
  instrument: SupervisionInstrument;
  title: string;
  description?: ReactNode;
  breadcrumb: BreadcrumbItem[];
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.supervision.observationForm");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { me } = useSession();
  const draftOwner = useDraftOwner();
  const timeZone = me?.tenant.timezone;
  const complete = useCompleteObservationMutation();

  const initialScores = Object.fromEntries(instrument.criteria.map((c) => [c.key, ""]));

  const [scores, setScores] = useState<Record<string, string>>(initialScores);
  const [observerNotes, setObserverNotes] = useState("");
  const [observedAt, setObservedAt] = useState(() => nowValue(timeZone));
  const [formError, setFormError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [savedSuccessfully, setSavedSuccessfully] = useState(false);
  const [draftOffer, setDraftOffer] = useState<{ savedAt: string } | null>(null);

  // Offer to restore an in-progress draft the browser still has from
  // before a reload or a dropped connection, once per observation and
  // owner: rechecked when the owner becomes known, and withdrawn when
  // there is none. This reads `window.localStorage`, which does not exist
  // during server rendering, so it cannot move into a lazy `useState`
  // initializer the way a server-safe value could -- the effect is the
  // deliberate, correct way to reach it only after the client has mounted.
  useEffect(() => {
    const draft = loadObservationDraft(draftOwner, scheduled.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see the comment above.
    setDraftOffer(draft ? { savedAt: draft.savedAt } : null);
  }, [draftOwner, scheduled.id]);

  const scoredCriteria = instrument.criteria.filter((c) => {
    const value = Number.parseInt(scores[c.key] ?? "", 10);
    return Number.isFinite(value) && value >= instrument.scale_min && value <= instrument.scale_max;
  });
  const totalCriteria = instrument.criteria.length;
  const allScored = scoredCriteria.length === totalCriteria;
  const observedInstant = toInstant(observedAt, timeZone);
  const notesMissing = observerNotes.trim() === "";
  const ready = allScored && !notesMissing;
  const runningAverage =
    scoredCriteria.length === 0
      ? null
      : scoredCriteria.reduce((sum, c) => sum + Number.parseInt(scores[c.key] ?? "0", 10), 0) /
        scoredCriteria.length;

  const isDirty = scoredCriteria.length > 0 || observerNotes.trim() !== "";
  useUnsavedChangesProtection(isDirty && !savedSuccessfully, t("discardChanges"));

  // Mirrors every edit to localStorage (try/catch inside the helper) so a
  // dropped classroom connection or an accidental reload does not throw
  // away scoring already in memory; cleared the moment a save succeeds.
  useEffect(() => {
    if (!isDirty) return;
    saveObservationDraft(draftOwner, scheduled.id, { scores, observerNotes, observedAt });
  }, [draftOwner, scheduled.id, scores, observerNotes, observedAt, isDirty]);

  function setScore(criterionKey: string, score: number) {
    setScores((prev) => ({ ...prev, [criterionKey]: String(score) }));
  }

  function restoreDraft() {
    const draft = loadObservationDraft(draftOwner, scheduled.id);
    if (!draft) return;
    setScores((prev) => ({ ...prev, ...draft.scores }));
    setObserverNotes(draft.observerNotes);
    setObservedAt(draft.observedAt);
    setDraftOffer(null);
  }

  function dismissDraft() {
    clearObservationDraft(draftOwner, scheduled.id);
    setDraftOffer(null);
  }

  async function submit() {
    setFormError(null);
    setAttempted(true);
    if (!ready || observedInstant === null) return;
    try {
      await complete.mutateAsync({
        scheduled_id: scheduled.id,
        scores: instrument.criteria.map((c) => ({
          criterion_key: c.key,
          score: Number.parseInt(scores[c.key] ?? "0", 10),
        })),
        observer_notes: observerNotes.trim(),
        observed_at: observedInstant.toISOString(),
      });
      setSavedSuccessfully(true);
      clearObservationDraft(draftOwner, scheduled.id);
      toast.success(
        t("savedAt", {
          time: formatTime(businessNow(), { locale, timeZone }),
        }),
      );
      onDone();
    } catch (error) {
      setFormError(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  const progress = t("progress", { scored: scoredCriteria.length, total: totalCriteria });
  return (
    <AppPage
      variant="narrow"
      title={title}
      description={description}
      breadcrumb={breadcrumb}
      nav={false}
      floating={
        <StickySaveBar
          container="narrow"
          leadingSlot={
            <span className="text-body-sm text-fg-muted tabular-nums">
              {runningAverage === null
                ? progress
                : t("progressWithAverage", {
                    progress,
                    average: formatScore(runningAverage, locale),
                  })}
            </span>
          }
          trailingSlot={
            formError && (
              <span role="alert" className="flex items-center gap-2 text-body-sm text-danger">
                {formError}
                <Button variant="link" size="sm" onClick={() => void submit()}>
                  {t("retry")}
                </Button>
              </span>
            )
          }
          saveLabel={t("submit")}
          saving={complete.isPending}
          onSave={() => void submit()}
        />
      }
    >
      <div className="flex flex-col gap-6 pb-28">
        {draftOffer && (
          <Alert
            tone="warning"
            title={t("draftFoundTitle")}
            action={
              <>
                <Button size="sm" onClick={restoreDraft}>
                  {t("draftRestore")}
                </Button>
                <Button size="sm" variant="secondary" onClick={dismissDraft}>
                  {t("draftDismiss")}
                </Button>
              </>
            }
          >
            {t("draftFoundBody", {
              time: formatTime(draftOffer.savedAt, { locale, timeZone }),
            })}
          </Alert>
        )}

        <Field
          label={t("observedAt")}
          required
          error={attempted && observedInstant === null ? t("observedAtRequired") : undefined}
        >
          {(control) => (
            <div
              role="group"
              aria-labelledby={control.labelId}
              aria-describedby={control["aria-describedby"]}
              className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2 sm:max-w-md"
            >
              <DatePicker
                value={observedAt.slice(0, 10)}
                onChange={(date) => {
                  setObservedAt(`${date}T${observedAt.slice(11, 16)}`);
                }}
                aria-label={t("observedDate")}
                disabled={complete.isPending}
                clearable={false}
              />
              <TimePicker
                value={observedAt.slice(11, 16)}
                onChange={(time) => {
                  setObservedAt(`${observedAt.slice(0, 10)}T${time}`);
                }}
                aria-label={t("observedTime")}
                disabled={complete.isPending}
              />
            </div>
          )}
        </Field>

        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("scoresHeading")}</CardTitle>
            <CardDescription>
              {t("scoresHint", { min: instrument.scale_min, max: instrument.scale_max })}
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-2">
            <ol className="flex flex-col divide-y divide-line">
              {instrument.criteria.map((c, index) => {
                const raw = scores[c.key] ?? "";
                const value = raw === "" ? null : Number.parseInt(raw, 10);
                const missing = attempted && (value === null || !Number.isFinite(value));
                return (
                  <li
                    key={c.key}
                    className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="w-5 shrink-0 text-right text-label text-fg-muted tabular-nums">
                        {index + 1}
                      </span>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-body font-semibold text-fg">{c.name}</span>
                        {missing && (
                          <span className="text-body-sm text-danger">{t("scoreMissing")}</span>
                        )}
                      </div>
                    </div>
                    <ObservationScoreControl
                      min={instrument.scale_min}
                      max={instrument.scale_max}
                      value={Number.isFinite(value) ? value : null}
                      label={t("scoreFor", { index: index + 1, name: c.name })}
                      disabled={complete.isPending}
                      onChange={(score) => {
                        setScore(c.key, score);
                      }}
                    />
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        <Field
          label={t("observerNotes")}
          required
          error={attempted && notesMissing ? t("observerNotesRequired") : undefined}
        >
          <Textarea
            rows={5}
            value={observerNotes}
            onChange={(e) => {
              setObserverNotes(e.target.value);
            }}
            placeholder={t("observerNotesPlaceholder")}
            disabled={complete.isPending}
          />
        </Field>
      </div>
    </AppPage>
  );
}
