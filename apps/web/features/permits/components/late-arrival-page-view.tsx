"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { Card, DataList, DataListItem, SkeletonDetail } from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { RecordNotFoundPage } from "../../../components/record-not-found";
import { isNotFoundError } from "../../../lib/api/not-found";
import { useSession } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useDirectoryNames } from "../../reference/directory-names";
import { type LateArrivalDetail, useLateArrivalQuery } from "../api";

import { ActiveLateArrival } from "./late-arrivals-view";
import { WorkflowStepper } from "./workflow-stepper";

/**
 * One late arrival's own page, the target of its notifications
 * ("/late-arrivals/{id}") and of the student's history rows. The student
 * gets their status card (with the next stage's scan while one is due);
 * staff, such as the homeroom teacher told a student of theirs came late,
 * the read-only record. An unknown id, or one the reader may not open,
 * gets the shared not-found page.
 */
export function LateArrivalPageView({ id }: { id: string }): ReactElement {
  const t = useTranslations("app.permits.late");
  const { me } = useSession();
  const { data, error, isLoading, refetch } = useLateArrivalQuery(id);
  const subjectId = data?.instance.subject_user_id;
  const own = subjectId !== undefined && subjectId === me?.id;
  const names = useDirectoryNames(own || !subjectId ? [] : [subjectId], !own);

  if (!data && (isNotFoundError(error) || (error instanceof ApiError && error.status === 403))) {
    return (
      <RecordNotFoundPage
        title={t("notFoundTitle")}
        description={t("notFoundBody")}
        backHref="/late-arrivals"
        backLabel={t("notFoundBack")}
      />
    );
  }

  const studentName = subjectId ? names.get(subjectId)?.name : undefined;
  return (
    <AppPage
      variant="narrow"
      title={data ? t("historyRow", { n: data.occurrence_number }) : t("detailTitle")}
      documentTitle={t("detailTitle")}
      description={
        !own && studentName
          ? [formatDisplayName(studentName), data?.class_name].filter(Boolean).join(" · ")
          : undefined
      }
    >
      {isLoading ? (
        <SkeletonDetail rows={3} />
      ) : !data ? (
        <QueryError retry={() => void refetch()} error={error} />
      ) : own ? (
        <ActiveLateArrival detail={data} />
      ) : (
        <Card padding="md">
          <LateArrivalRecord detail={data} />
        </Card>
      )}
    </AppPage>
  );
}

/** A late arrival as staff read it: its stages, and what was recorded. */
function LateArrivalRecord({ detail }: { detail: LateArrivalDetail }): ReactElement {
  const t = useTranslations("app.permits.late");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  return (
    <div className="flex flex-col gap-5">
      <WorkflowStepper instance={detail.instance} />
      <DataList>
        <DataListItem label={t("recordedAt")}>
          {formatDateTime(detail.instance.opened_at, { locale, timeZone: me?.tenant.timezone })}
        </DataListItem>
        {detail.reason && <DataListItem label={t("reasonLabel")}>{detail.reason}</DataListItem>}
        <DataListItem label={t("requiredAction")}>
          {t(`actions.${detail.required_action}`)}
        </DataListItem>
      </DataList>
    </div>
  );
}
