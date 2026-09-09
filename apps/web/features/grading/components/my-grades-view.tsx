"use client";

import { Alert, Badge, EmptyState, PageHeader, Skeleton, domainIcons } from "@newsekolah/ui";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useLookup, useSubjectsQuery } from "../../reference/api";
import { type MySubjectGrade, useMyGradesQuery } from "../api";

/**
 * The student's own grades: one card per subject the teacher has
 * published, each with its components, average, and report score. Nothing
 * shows for a subject until its teacher publishes it (see docs/07-ui-ux.md
 * section 5's "umpan balik" and "tanpa halaman yang hanya reload").
 */
export function MyGradesView(): ReactElement {
  const t = useTranslations("app.grading.myGrades");
  const { data, isLoading, error } = useMyGradesQuery();
  const subjects = useSubjectsQuery();
  const subjectMap = useLookup(subjects.data?.data);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return <Alert variant="warning" title={t("loadError")} className="m-6" />;
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title", { term: data.term_name })}
        actions={
          <span className="flex items-center gap-1.5 text-[14px] font-medium text-fg">
            <Star className="size-4" aria-hidden="true" />
            {t("stars", { count: data.stars })}
          </span>
        }
      />

      {data.subjects.length === 0 ? (
        <EmptyState
          icon={<domainIcons.grades aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.subjects.map((subject) => (
            <SubjectCard
              key={subject.subject_id}
              subject={subject}
              subjectName={subjectMap.get(subject.subject_id)?.name ?? t("unknownSubject")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SubjectCard({
  subject,
  subjectName,
}: {
  subject: MySubjectGrade;
  subjectName: string;
}): ReactElement {
  const t = useTranslations("app.grading.myGrades");
  const tKind = useTranslations("app.grading.kind");

  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[16px] font-medium text-fg">{subjectName}</h2>
        {subject.report_score !== undefined && (
          <span className="text-[20px] font-medium text-fg [font-variant-numeric:tabular-nums]">
            {subject.report_score.toFixed(1)}
          </span>
        )}
      </div>

      {subject.components.length === 0 ? (
        <p className="text-[13px] text-fg-muted">{t("noComponents")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {subject.components.map((component) => (
            <li
              key={component.code}
              className="flex items-center justify-between gap-2 text-[13px]"
            >
              <span className="text-fg">
                {component.code}
                <span className="ml-1.5 text-fg-muted">{tKind(component.kind)}</span>
              </span>
              <span className="flex items-center gap-2">
                {component.kktp !== undefined && component.score < component.kktp && (
                  <Badge variant="neutral">{t("belowKktp")}</Badge>
                )}
                <span className="font-medium text-fg [font-variant-numeric:tabular-nums]">
                  {component.score.toFixed(1)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {subject.average !== undefined && (
        <p className="border-t border-border pt-2 text-[13px] text-fg-muted">
          {t("average", { score: subject.average.toFixed(1) })}
        </p>
      )}
    </section>
  );
}
