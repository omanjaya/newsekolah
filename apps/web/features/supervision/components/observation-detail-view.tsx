"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { Button, PageHeader, Skeleton, Textarea, useToast } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  useObservationQuery,
  useRespondToObservationMutation,
  useSupervisionCycleQuery,
} from "../api";

/**
 * One observation: the scores, the observer's notes, and the teacher's own
 * response and agreed follow-up. `getObservation` already enforces who may
 * open this (observer, leadership, or the observed teacher); the response
 * form on top of that only appears with `respond_to_supervision`.
 */
export function ObservationDetailView({ observationId }: { observationId: string }): ReactElement {
  const t = useTranslations("app.supervision.observationDetail");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canRespond = useCan("respond_to_supervision");

  const observation = useObservationQuery(observationId);
  const cycle = useSupervisionCycleQuery(observation.data?.cycle_id ?? "", !!observation.data);
  const respond = useRespondToObservationMutation();

  const [teacherResponse, setTeacherResponse] = useState("");
  const [agreedFollowUp, setAgreedFollowUp] = useState("");
  const [editingResponse, setEditingResponse] = useState(false);

  if (observation.isError && !observation.data)
    return <QueryError retry={() => observation.refetch()} className="m-4" />;
  if (cycle.isError && !cycle.data)
    return <QueryError retry={() => cycle.refetch()} className="m-4" />;

  if (observation.isLoading || !observation.data || cycle.isLoading || !cycle.data) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const obs = observation.data;
  const criteriaByKey = new Map(cycle.data.instrument.criteria.map((c) => [c.key, c.name]));

  function startEditing() {
    setTeacherResponse(obs.teacher_response);
    setAgreedFollowUp(obs.agreed_follow_up);
    setEditingResponse(true);
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow", { cycle: cycle.data.name })}
        title={formatDateTime(obs.observed_at, { locale })}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-[16px] font-medium">{t("scores")}</h2>
        <ul className="flex max-w-sm flex-col gap-1 text-[13px]">
          {obs.scores.map((s) => (
            <li key={s.criterion_key} className="flex justify-between gap-2">
              <span className="text-fg-muted">
                {criteriaByKey.get(s.criterion_key) ?? s.criterion_key}
              </span>
              <span className="tabular-nums">{s.score}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2 border-t border-border pt-4">
        <h2 className="text-[16px] font-medium">{t("observerNotes")}</h2>
        <p className="whitespace-pre-wrap text-[13px] text-fg">{obs.observer_notes}</p>
      </section>

      <section className="flex flex-col gap-3 border-t border-border pt-4">
        <h2 className="text-[16px] font-medium">{t("teacherResponse")}</h2>
        {editingResponse ? (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("responseLabel")}</span>
              <Textarea
                rows={4}
                value={teacherResponse}
                onChange={(e) => {
                  setTeacherResponse(e.target.value);
                }}
                placeholder={t("responsePlaceholder")}
              />
            </label>
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">{t("followUpLabel")}</span>
              <Textarea
                rows={3}
                value={agreedFollowUp}
                onChange={(e) => {
                  setAgreedFollowUp(e.target.value);
                }}
                placeholder={t("followUpPlaceholder")}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditingResponse(false);
                }}
              >
                {t("cancel")}
              </Button>
              <Button
                size="sm"
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
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {obs.teacher_response ? (
              <p className="whitespace-pre-wrap text-[13px] text-fg">{obs.teacher_response}</p>
            ) : (
              <p className="text-[13px] text-fg-muted">{t("noResponseYet")}</p>
            )}
            {obs.agreed_follow_up && (
              <div className="flex flex-col gap-1 border-t border-border pt-3">
                <span className="text-[13px] font-medium">{t("followUpLabel")}</span>
                <p className="whitespace-pre-wrap text-[13px] text-fg-muted">
                  {obs.agreed_follow_up}
                </p>
              </div>
            )}
            {canRespond && (
              <div>
                <Button size="sm" variant="secondary" onClick={startEditing}>
                  {obs.teacher_response ? t("editResponse") : t("addResponse")}
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
