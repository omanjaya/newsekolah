"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FormActions,
  Progress,
  SkeletonDetail,
  Textarea,
  useToast,
} from "@newsekolah/ui";
import { Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { useDirectoryNames } from "../../reference/directory-names";
import {
  useObservationQuery,
  useRespondToObservationMutation,
  useScheduledObservationsForTeacherQuery,
  useSupervisionCycleQuery,
} from "../api";
import { averageScore, formatScore } from "../lib/score-format";
import { cycleHref, useCycleTrail } from "../lib/use-cycle-trail";
import { useLessonContext } from "../lib/use-lesson-context";

/** A block of free text, or a quiet line when there is none yet. */
function Prose({ text, empty }: { text: string; empty: string }): ReactElement {
  return text ? (
    <p className="max-w-prose text-body whitespace-pre-wrap text-fg">{text}</p>
  ) : (
    <p className="text-body-sm text-fg-muted">{empty}</p>
  );
}

/**
 * One observation: each criterion's score against the scale and the
 * average, the observer's notes, then the teacher's response and the
 * agreed follow-up. `getObservation` already enforces who may open this
 * (observer, leadership, or the observed teacher); the response form on
 * top of that only appears with `respond_to_supervision`.
 */
export function ObservationDetailView({ observationId }: { observationId: string }): ReactElement {
  const t = useTranslations("app.supervision.observationDetail");
  const tRoot = useTranslations("app.supervision");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canRespond = useCan("respond_to_supervision");

  const observation = useObservationQuery(observationId);
  const cycle = useSupervisionCycleQuery(observation.data?.cycle_id ?? "", !!observation.data);
  const teacherMap = useDirectoryNames([observation.data?.teacher_user_id]);
  // Resolved best-effort, for the "subject/class if available" line: the
  // scheduled observation this record came from carries the `schedule_id`
  // needed to look up class/subject, but `Observation` itself does not.
  const scheduledForTeacher = useScheduledObservationsForTeacherQuery(
    observation.data?.cycle_id ?? "",
    observation.data?.teacher_user_id ?? "",
    !!observation.data,
  );
  const scheduled = scheduledForTeacher.data?.data.find(
    (s) => s.id === observation.data?.scheduled_id,
  );
  const lesson = useLessonContext(
    observation.data?.teacher_user_id ?? "",
    scheduled?.schedule_id ?? "",
  );
  const respond = useRespondToObservationMutation();

  const [teacherResponse, setTeacherResponse] = useState("");
  const [agreedFollowUp, setAgreedFollowUp] = useState("");
  const [editingResponse, setEditingResponse] = useState(false);

  const trail = useCycleTrail();
  // A teacher reading their own observation without the school-wide view
  // (view_own_supervision only) cannot open the cycles, so their trail
  // goes back through "Supervisi saya" instead.
  const canViewAll = useCan("view_supervision");
  const ownRoot = {
    label: tRoot("navLabelMyReport"),
    href: observation.data
      ? `/supervision/my-report?cycle=${encodeURIComponent(observation.data.cycle_id)}`
      : "/supervision/my-report",
  };
  const pendingTrail = [canViewAll ? trail.root : ownRoot, { label: t("title") }];

  if ((observation.isError && !observation.data) || (cycle.isError && !cycle.data)) {
    return (
      <AppPage variant="narrow" nav={false} breadcrumb={pendingTrail} title={t("title")}>
        <QueryError
          retry={() => {
            void observation.refetch();
            void cycle.refetch();
          }}
          error={observation.error ?? cycle.error}
        />
      </AppPage>
    );
  }

  if (observation.isLoading || !observation.data || cycle.isLoading || !cycle.data) {
    return (
      <AppPage variant="narrow" nav={false} breadcrumb={pendingTrail} title={t("title")}>
        <SkeletonDetail />
      </AppPage>
    );
  }

  const obs = observation.data;
  const { instrument } = cycle.data;
  const criteriaByKey = new Map(instrument.criteria.map((c) => [c.key, c.name]));
  // The scores in the instrument's order, so each carries the number the
  // criterion has on the cycle's instrument; a key the instrument no longer
  // lists goes last.
  const position = new Map(instrument.criteria.map((c, index) => [c.key, index]));
  const scores = [...obs.scores].sort(
    (a, b) =>
      (position.get(a.criterion_key) ?? Number.MAX_SAFE_INTEGER) -
      (position.get(b.criterion_key) ?? Number.MAX_SAFE_INTEGER),
  );
  const span = Math.max(instrument.scale_max - instrument.scale_min, 1);
  const average = averageScore(obs.scores);
  const teacherName =
    teacherMap.get(obs.teacher_user_id)?.name ?? tRoot("cycleDetail.unknownTeacher");
  const details = [
    formatDateTime(obs.observed_at, { locale, timeZone: me?.tenant.timezone }),
    lesson.subjectName,
    lesson.className,
  ]
    .filter(Boolean)
    .join(" · ");

  function startEditing() {
    setTeacherResponse(obs.teacher_response);
    setAgreedFollowUp(obs.agreed_follow_up);
    setEditingResponse(true);
  }

  return (
    <AppPage
      // Reading width: scores, notes and the response are one column of text.
      variant="narrow"
      // The trail walks back through the teacher's report, which the
      // phone's back link opens; the teacher is named there, so the h1
      // says what this page is.
      title={t("title")}
      documentTitle={`${t("title")} · ${teacherName}`}
      description={details}
      nav={false}
      breadcrumb={
        canViewAll
          ? trail.within(cycle.data.id, cycle.data.name, trail.results(cycle.data.id), {
              label: teacherName,
              href: `${cycleHref(cycle.data.id)}/teachers/${encodeURIComponent(obs.teacher_user_id)}/report`,
            })
          : [ownRoot, { label: t("title") }]
      }
    >
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("scores")}</CardTitle>
          <CardDescription>
            {average === null
              ? t("scale", { min: instrument.scale_min, max: instrument.scale_max })
              : t("averageOfScale", {
                  average: formatScore(average, locale),
                  min: instrument.scale_min,
                  max: instrument.scale_max,
                })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {scores.map((s, index) => (
            // The criterion's number in a muted column of its own, as on
            // the cycle's instrument and the scoring form.
            <div key={s.criterion_key} className="flex items-start gap-3">
              <span className="w-5 shrink-0 text-right text-label text-fg-muted tabular-nums">
                {index + 1}
              </span>
              <Progress
                className="min-w-0 flex-1"
                variant="meter"
                label={
                  criteriaByKey.get(s.criterion_key) ?? t("criterionFallback", { n: index + 1 })
                }
                value={s.score - instrument.scale_min}
                max={span}
                valueLabel={String(s.score)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("observerNotes")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Prose text={obs.observer_notes} empty={t("noNotes")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          action={
            canRespond && !editingResponse ? (
              <Button size="sm" variant="secondary" icon={<Pencil />} onClick={startEditing}>
                {obs.teacher_response ? t("editResponse") : t("addResponse")}
              </Button>
            ) : undefined
          }
        >
          <CardTitle as="h2">{t("teacherResponse")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {editingResponse ? (
            <>
              <Field label={t("responseLabel")}>
                <Textarea
                  rows={4}
                  value={teacherResponse}
                  onChange={(e) => {
                    setTeacherResponse(e.target.value);
                  }}
                  placeholder={t("responsePlaceholder")}
                />
              </Field>
              <Field label={t("followUpLabel")} optional>
                <Textarea
                  rows={3}
                  value={agreedFollowUp}
                  onChange={(e) => {
                    setAgreedFollowUp(e.target.value);
                  }}
                />
              </Field>
              <FormActions>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingResponse(false);
                  }}
                >
                  {t("cancel")}
                </Button>
                <Button
                  loading={respond.isPending}
                  onClick={() => {
                    respond.mutate(
                      {
                        observationId,
                        teacher_response: teacherResponse.trim() || undefined,
                        agreed_follow_up: agreedFollowUp.trim() || undefined,
                      },
                      {
                        onSuccess: () => {
                          toast.success(t("saved"));
                          setEditingResponse(false);
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
                  {t("submit")}
                </Button>
              </FormActions>
            </>
          ) : (
            <Prose text={obs.teacher_response} empty={t("noResponseYet")} />
          )}
        </CardContent>
      </Card>

      {!editingResponse && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("followUpLabel")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Prose text={obs.agreed_follow_up} empty={t("noFollowUpYet")} />
          </CardContent>
        </Card>
      )}
    </AppPage>
  );
}
