"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { Button, EmptyState, SkeletonForm, domainIcons } from "@newsekolah/ui";
import { Eye } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { isNotFoundError } from "../../../lib/api/not-found";
import { useDirectoryNames } from "../../reference/directory-names";
import { useScheduledObservationsQuery, useSupervisionCycleQuery } from "../api";
import { cycleHref, useCycleTrail } from "../lib/use-cycle-trail";
import { useLessonContext } from "../lib/use-lesson-context";

import { CompleteObservationForm } from "./complete-observation-form";
import { CycleNotFoundPage } from "./cycle-not-found";

/**
 * The full-page "fill the instrument" screen for one scheduled observation:
 * the trail back to its cycle, who is being observed, in which subject and
 * class and on which day, then the scoring form itself. Its own route
 * (rather than a dialog on the cycle page) so the sticky save bar sits at
 * the true screen edge, the way it does for the attendance roster.
 */
export function CompleteObservationView({
  cycleId,
  scheduledId,
}: {
  cycleId: string;
  scheduledId: string;
}): ReactElement {
  const t = useTranslations("app.supervision.completeObservation");
  const tRoot = useTranslations("app.supervision");
  const trail = useCycleTrail();
  const locale = useLocale() as Locale;
  const router = useRouter();

  const cycle = useSupervisionCycleQuery(cycleId);
  const scheduledList = useScheduledObservationsQuery(cycleId);
  const teacherMap = useDirectoryNames(
    (scheduledList.data?.data ?? []).map((item) => item.teacher_user_id),
  );

  const scheduled = scheduledList.data?.data.find((s) => s.id === scheduledId);
  const lesson = useLessonContext(scheduled?.schedule_id ?? "");

  const backHref = cycleHref(cycleId);
  const breadcrumb = trail.within(cycleId, cycle.data?.name, { label: t("breadcrumb") });

  // An unknown or malformed cycle id is a missing cycle, not a failure to
  // retry. Both requests carry nothing but that id and fail for it in
  // parallel, so either one's answer is enough, whichever lands first.
  // (A scheduled id the cycle does not have is told below, once the
  // cycle's list has loaded.)
  const cycleMissing =
    (cycle.isError && !cycle.data && isNotFoundError(cycle.error)) ||
    (scheduledList.isError && !scheduledList.data && isNotFoundError(scheduledList.error));
  if (cycleMissing) {
    return <CycleNotFoundPage />;
  }

  // A failed list waits for the cycle's own answer, which may still turn
  // out to be its not-found page rather than a failure to retry.
  const failed =
    (cycle.isError && !cycle.data) ||
    (scheduledList.isError && !scheduledList.data && !cycle.isPending);
  if (failed) {
    return (
      <AppPage variant="narrow" nav={false} breadcrumb={breadcrumb} title={t("breadcrumb")}>
        <QueryError
          retry={() => {
            void cycle.refetch();
            void scheduledList.refetch();
          }}
          error={cycle.error ?? scheduledList.error}
        />
      </AppPage>
    );
  }

  if (cycle.isLoading || !cycle.data || scheduledList.isLoading || !scheduledList.data) {
    return (
      <AppPage variant="narrow" nav={false} breadcrumb={breadcrumb} title={t("breadcrumb")}>
        <SkeletonForm fields={5} />
      </AppPage>
    );
  }

  if (!scheduled) {
    return (
      <AppPage variant="narrow" nav={false} breadcrumb={breadcrumb} title={t("breadcrumb")}>
        <EmptyState
          icon={<domainIcons.supervision />}
          title={t("notFoundTitle")}
          description={t("notFoundBody")}
          action={
            <Button asChild variant="secondary">
              <Link href={backHref}>{t("backToCycle")}</Link>
            </Button>
          }
        />
      </AppPage>
    );
  }

  // A deep link to a visit that is already filled in must not start a
  // second fill (the API refuses it on save, after the work is done).
  // The page heading names the saved result, not the fill it no longer offers.
  if (scheduled.observation_id) {
    return (
      <AppPage
        variant="narrow"
        nav={false}
        breadcrumb={trail.within(cycleId, cycle.data.name, { label: t("doneBreadcrumb") })}
        title={t("doneBreadcrumb")}
      >
        <EmptyState
          icon={<domainIcons.supervision />}
          title={t("doneTitle")}
          description={t("doneBody")}
          action={
            <Button asChild icon={<Eye />}>
              <Link href={`/supervision/observations/${scheduled.observation_id}`}>
                {t("viewResult")}
              </Link>
            </Button>
          }
        />
      </AppPage>
    );
  }

  const teacherName =
    teacherMap.get(scheduled.teacher_user_id)?.name ?? tRoot("cycleDetail.unknownTeacher");
  const details = [
    formatDate(scheduled.lesson_date, { locale, timeZone: "UTC" }),
    lesson.subjectName,
    lesson.className,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <CompleteObservationForm
      scheduled={scheduled}
      instrument={cycle.data.instrument}
      title={teacherName}
      description={details}
      breadcrumb={breadcrumb}
      onDone={() => {
        router.push(backHref);
      }}
    />
  );
}
