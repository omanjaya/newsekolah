"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { Button, EmptyState, PageHeader, Skeleton, domainIcons } from "@newsekolah/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { useLookup, useTeachersQuery } from "../../reference/api";
import { useScheduledObservationsQuery, useSupervisionCycleQuery } from "../api";
import { useLessonContext } from "../lib/use-lesson-context";

import { CompleteObservationForm } from "./complete-observation-form";

/**
 * The full-page "fill the instrument" screen for one scheduled observation:
 * who is being observed, in which class/subject, for which cycle, and when
 * the visit was planned -- then the scoring form itself. Its own route
 * (rather than the dialog this used to open from the cycle detail table)
 * so the sticky bottom save bar sits at the true screen edge, the way it
 * does for the attendance roster, instead of fighting a modal's bounds.
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
  const locale = useLocale() as Locale;
  const router = useRouter();

  const cycle = useSupervisionCycleQuery(cycleId);
  const scheduledList = useScheduledObservationsQuery(cycleId);
  const teachers = useTeachersQuery();
  const teacherMap = useLookup(teachers.data?.data);

  const scheduled = scheduledList.data?.data.find((s) => s.id === scheduledId);
  const lesson = useLessonContext(scheduled?.teacher_user_id ?? "", scheduled?.schedule_id ?? "");

  const backHref = `/supervision/cycles/${cycleId}`;

  if (cycle.isError && !cycle.data)
    return <QueryError retry={() => cycle.refetch()} className="m-4" />;
  if (scheduledList.isError && !scheduledList.data)
    return <QueryError retry={() => scheduledList.refetch()} className="m-4" />;

  if (cycle.isLoading || !cycle.data || scheduledList.isLoading || !scheduledList.data) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!scheduled) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <Button asChild variant="secondary" size="sm" className="self-start">
          <Link href={backHref}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("backToCycle")}
          </Link>
        </Button>
        <EmptyState
          icon={<domainIcons.supervision aria-hidden="true" />}
          title={t("notFoundTitle")}
          description={t("notFoundBody")}
        />
      </div>
    );
  }

  const teacherName =
    teacherMap.get(scheduled.teacher_user_id)?.name ?? tRoot("cycleDetail.unknownTeacher");
  const lessonDateLabel = formatDate(scheduled.lesson_date, { locale });
  const contextLine = [lesson.subjectName, lesson.className].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-6 p-4 pb-28 md:p-6 md:pb-28">
      <div className="flex flex-col gap-2">
        <Button asChild variant="secondary" size="sm" className="self-start">
          <Link href={backHref}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("backToCycle")}
          </Link>
        </Button>
        <PageHeader
          breadcrumb={[
            { label: tRoot("navLabelCycles"), href: "/supervision/cycles" },
            { label: cycle.data.name, href: backHref },
          ]}
          eyebrow={cycle.data.name}
          title={teacherName}
        />
        <p className="text-[13px] text-fg-muted">
          {lessonDateLabel}
          {contextLine && <> &middot; {contextLine}</>}
        </p>
      </div>

      <CompleteObservationForm
        scheduled={scheduled}
        instrument={cycle.data.instrument}
        onDone={() => {
          router.push(backHref);
        }}
      />
    </div>
  );
}
