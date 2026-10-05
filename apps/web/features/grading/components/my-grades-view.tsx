"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Select,
  Skeleton,
  StatTile,
  cn,
  domainIcons,
} from "@newsekolah/ui";
import { Minus, Star, TrendingDown, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { bentoCells, tileColumns } from "../../../lib/layout/bento";
import { useLookup, useSubjectsQuery } from "../../reference/api";
import { type MySubjectGrade, useMyGradesQuery, useMyStarsQuery, useTermsQuery } from "../api";
import { buildMyGradesTiles, isSubjectTuntas } from "../lib/my-grades-tiles";

// Radix Select treats an empty value as "nothing chosen" and shows the
// placeholder, so "all terms" needs a real option value of its own.
const ALL_TERMS = "all";

/**
 * The student's own grades: a stat-tile row (average, how many subjects
 * are tuntas, how many scores exist this term), a term pill, then one
 * bento card per subject the teacher has published, each with its
 * components, average, and report score. Nothing shows for a subject
 * until its teacher publishes it (see docs/07-ui-ux.md section 5's
 * "umpan balik" and "tanpa halaman yang hanya reload").
 */
export function MyGradesView(): ReactElement {
  const t = useTranslations("app.grading.myGrades");
  const tGrading = useTranslations("app.grading");
  const tApp = useTranslations("app");
  const [termId, setTermId] = useState("");
  const terms = useTermsQuery();
  const { data, isLoading, error, refetch, isRefetching } = useMyGradesQuery(termId || undefined);
  const stars = useMyStarsQuery();
  const subjects = useSubjectsQuery();
  const subjectMap = useLookup(subjects.data?.data);

  const termOptions = [
    { value: ALL_TERMS, label: tGrading("allTerms") },
    ...(terms.data?.data ?? []).map((term) => ({ value: term.id, label: term.name })),
  ];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Skeleton className="h-[104px] w-full" />
          <Skeleton className="h-[104px] w-full" />
          <Skeleton className="h-[104px] w-full" />
        </div>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-4 md:p-6">
        <Alert variant="warning" title={t("loadError")}>
          <Button
            variant="secondary"
            loading={isRefetching}
            onClick={() => {
              void refetch();
            }}
          >
            {tApp("offlinePage.retry")}
          </Button>
        </Alert>
      </div>
    );
  }

  const tiles = buildMyGradesTiles(data.subjects, data.scale.default_kktp);
  const tileGrid = tileColumns(tiles.length);
  const cells = bentoCells(
    data.subjects.map((subject) => ({
      key: subject.subject_id,
      node: (
        <SubjectCard
          subject={subject}
          subjectName={subjectMap.get(subject.subject_id)?.name ?? t("unknownSubject")}
          defaultKktp={data.scale.default_kktp}
        />
      ),
    })),
  );

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title", { term: data.term_name })}
        actions={
          <>
            <Select
              options={termOptions}
              value={termId || ALL_TERMS}
              onValueChange={(value) => {
                setTermId(value === ALL_TERMS ? "" : value);
              }}
              aria-label={tGrading("pickTerm")}
              className="w-full rounded-full md:w-40"
            />
            <span className="flex items-center gap-1.5 text-[14px] font-medium text-fg">
              <Star className="size-4" aria-hidden="true" />
              {t("stars", { count: data.stars })}
            </span>
          </>
        }
      />

      {data.subjects.length === 0 ? (
        <EmptyState
          icon={<domainIcons.grades aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <>
          <div className={tileGrid.container} data-testid="my-grades-tiles">
            {tiles.map((tile, index) => (
              <div
                key={tile.key}
                data-testid={`my-grades-tile-${tile.key}`}
                className={cn("h-full", index === tiles.length - 1 && tileGrid.lastTileClassName)}
              >
                <StatTile
                  className="h-full"
                  icon={tile.icon}
                  tone={tile.tone}
                  value={tile.value}
                  label={t(tile.labelKey)}
                />
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2" data-testid="my-grades-subject-cards">
            {cells.map((cell) => (
              <div
                key={cell.key}
                data-testid={`my-grades-subject-cell-${cell.key}`}
                className={cn("flex h-full flex-col", cell.span === "full" && "md:col-span-2")}
              >
                <div className="flex-1">{cell.node}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {data.stars > 0 && (
        <section className="flex flex-col gap-2 rounded-sm border border-border bg-surface p-4">
          <h2 className="text-[16px] font-medium text-fg">{t("starsBreakdown")}</h2>
          {stars.isLoading ? (
            <Skeleton className="h-16 w-full" aria-busy="true" />
          ) : (stars.data?.subjects.length ?? 0) === 0 ? (
            <p className="text-[13px] text-fg-muted">{t("starsBreakdownEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {stars.data?.subjects.map((group, index) => (
                <li key={index} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-fg">
                    {group.subject_name ??
                      subjectMap.get(group.subject_id ?? "")?.name ??
                      t("unknownSubject")}
                  </span>
                  <span className="[font-variant-numeric:tabular-nums] text-fg-muted">
                    {t("starsBreakdownRow", { count: group.total, teacher: group.teacher_name })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * A simple, defensible trend from the data already on hand: the last two
 * scored components in the order the teacher entered them (chronological
 * for how a gradebook fills in over a term), not a synthetic history the
 * API does not carry. Fewer than two scored components has no trend to
 * show, so the card stays silent rather than guessing.
 */
function subjectTrend(components: MySubjectGrade["components"]): "up" | "down" | "flat" | null {
  if (components.length < 2) return null;
  const latest = components[components.length - 1];
  const previous = components[components.length - 2];
  if (!latest || !previous) return null;
  if (latest.score > previous.score) return "up";
  if (latest.score < previous.score) return "down";
  return "flat";
}

const TREND_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus } as const;
const TREND_CLASS = {
  up: "text-status-present",
  down: "text-status-absent",
  flat: "text-fg-muted",
} as const;

function SubjectCard({
  subject,
  subjectName,
  defaultKktp,
}: {
  subject: MySubjectGrade;
  subjectName: string;
  defaultKktp: number;
}): ReactElement {
  const t = useTranslations("app.grading.myGrades");
  const tKind = useTranslations("app.grading.kind");
  const trend = subjectTrend(subject.components);
  const TrendIcon = trend ? TREND_ICON[trend] : null;
  const tuntas = isSubjectTuntas(subject, defaultKktp);

  return (
    <Card
      className="flex h-full flex-col gap-3 p-4"
      data-testid={`my-grades-subject-card-${subject.subject_id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-[16px] font-medium text-fg">{subjectName}</h2>
          {tuntas !== undefined && (
            <Badge variant={tuntas ? "accent" : "neutral"}>
              {tuntas ? t("tuntasBadge") : t("notTuntasBadge")}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {trend && TrendIcon && (
            <span
              className={cn("flex items-center gap-1 text-[12px] font-medium", TREND_CLASS[trend])}
            >
              <TrendIcon className="size-3.5" aria-hidden="true" />
              {t(`trend.${trend}`)}
            </span>
          )}
          {subject.report_score !== undefined && (
            <span className="text-[20px] font-medium text-fg [font-variant-numeric:tabular-nums]">
              {subject.report_score.toFixed(1)}
            </span>
          )}
        </div>
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
        <p className="mt-auto border-t border-border pt-2 text-[13px] text-fg-muted">
          {t("average", { score: subject.average.toFixed(1) })}
        </p>
      )}
    </Card>
  );
}
