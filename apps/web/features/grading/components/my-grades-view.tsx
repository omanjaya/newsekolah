"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  EmptyState,
  List,
  ListRow,
  Progress,
  Select,
  SkeletonCards,
  SkeletonList,
  Stat,
  StatGrid,
  cn,
  domainIcons,
} from "@newsekolah/ui";
import { Minus, Star, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { navAccessFromMe } from "../../../lib/navigation-access";
import { canOpenPath } from "../../../lib/navigation-permissions";
import { useSession } from "../../../lib/session/session-provider";
import { useLookup, useSubjectsQuery } from "../../reference/api";
import { type MySubjectGrade, useMyGradesQuery, useMyStarsQuery, useTermsQuery } from "../api";
import { formatScore } from "../lib/format-score";
import { buildMyGradesTiles, isSubjectTuntas, subjectEffectiveKktp } from "../lib/my-grades-tiles";

// Radix Select treats an empty value as "nothing chosen" and shows the
// placeholder, so "all terms" needs a real option value of its own.
const ALL_TERMS = "all";

/**
 * The student's own grades: one strip of figures (average, subjects at
 * their KKTP, scores so far, stars), then one card per subject the teacher
 * has published with its report score set large and a meter against the
 * subject's KKTP, so a student sees at once how far a subject is from
 * tuntas. Nothing shows for a subject until its teacher publishes it.
 */
export function MyGradesView(): ReactElement {
  const t = useTranslations("app.grading.myGrades");
  const locale = useLocale();
  const tGrading = useTranslations("app.grading");
  const { me } = useSession();
  const [termId, setTermId] = useState("");
  const terms = useTermsQuery();
  const { data, isLoading, error, refetch } = useMyGradesQuery(termId || undefined);
  const stars = useMyStarsQuery();
  const subjects = useSubjectsQuery();
  const subjectMap = useLookup(subjects.data?.data);

  const termSelect = (
    <Select
      options={[
        { value: ALL_TERMS, label: tGrading("allTerms") },
        ...(terms.data?.data ?? []).map((term) => ({ value: term.id, label: term.name })),
      ]}
      value={termId || ALL_TERMS}
      onValueChange={(value) => {
        setTermId(value === ALL_TERMS ? "" : value);
      }}
      aria-label={tGrading("pickTerm")}
      className="w-full sm:w-44"
    />
  );

  // A staff member who lands here has no grades of their own; point them
  // at the grading workspace instead of a student's empty state.
  if (me && me.profile_kind !== "student") {
    const canGrade = canOpenPath("/grading", navAccessFromMe(me));
    return (
      <AppPage>
        <EmptyState
          icon={<domainIcons.grades aria-hidden="true" />}
          title={t("studentsOnlyTitle")}
          description={t("studentsOnlyBody")}
          action={
            canGrade ? (
              <Button asChild variant="secondary">
                <Link href="/grading">{t("openGrading")}</Link>
              </Button>
            ) : undefined
          }
        />
      </AppPage>
    );
  }

  if (isLoading) {
    return (
      <AppPage actions={termSelect}>
        <SkeletonCards count={4} />
        <SkeletonList rows={4} />
      </AppPage>
    );
  }
  if (error || !data) {
    return (
      <AppPage actions={termSelect}>
        <QueryError retry={refetch} error={error} />
      </AppPage>
    );
  }

  const figures = buildMyGradesTiles(data.subjects, data.scale.default_kktp, locale);

  return (
    <AppPage description={data.term_name} actions={termSelect}>
      {data.subjects.length === 0 ? (
        <EmptyState
          icon={<domainIcons.grades aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <>
          <StatGrid variant="strip" aria-label={t("statsLabel")} data-testid="my-grades-tiles">
            {figures.map((figure) => {
              const Icon = figure.icon;
              return (
                <Stat
                  key={figure.key}
                  data-testid={`my-grades-tile-${figure.key}`}
                  icon={<Icon />}
                  tone={figure.tone}
                  value={figure.value}
                  label={t(figure.labelKey)}
                />
              );
            })}
            <Stat
              data-testid="my-grades-tile-stars"
              icon={<Star />}
              tone="amber"
              value={data.stars}
              label={t("statStars")}
              href={data.stars > 0 ? "#bintang" : undefined}
            />
          </StatGrid>

          <div
            className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3"
            data-testid="my-grades-subject-cards"
          >
            {data.subjects.map((subject) => (
              <SubjectCard
                key={subject.subject_id}
                subject={subject}
                subjectName={subjectMap.get(subject.subject_id)?.name ?? t("unknownSubject")}
                defaultKktp={data.scale.default_kktp}
                scaleMax={data.scale.max}
              />
            ))}
          </div>
        </>
      )}

      {data.stars > 0 && (
        <Card id="bintang" className="scroll-mt-20">
          <CardHeader>
            <CardTitle as="h2">{t("starsBreakdown")}</CardTitle>
          </CardHeader>
          {stars.isLoading ? (
            <SkeletonList rows={2} framed={false} />
          ) : (stars.data?.subjects.length ?? 0) === 0 ? (
            <CardFooter>
              <p className="text-body-sm text-fg-muted">{t("starsBreakdownEmpty")}</p>
            </CardFooter>
          ) : (
            <List>
              {stars.data?.subjects.map((group, index) => (
                <ListRow
                  key={`${group.subject_id ?? ""}-${String(index)}`}
                  title={
                    group.subject_name ??
                    subjectMap.get(group.subject_id ?? "")?.name ??
                    t("unknownSubject")
                  }
                  trailing={t("starsBreakdownRow", {
                    count: group.total,
                    teacher: group.teacher_name,
                  })}
                />
              ))}
            </List>
          )}
        </Card>
      )}
    </AppPage>
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
  up: "text-success",
  down: "text-danger",
  flat: "text-fg-muted",
} as const;

function SubjectCard({
  subject,
  subjectName,
  defaultKktp,
  scaleMax,
}: {
  subject: MySubjectGrade;
  subjectName: string;
  defaultKktp: number;
  scaleMax: number;
}): ReactElement {
  const t = useTranslations("app.grading.myGrades");
  const tKind = useTranslations("app.grading.kind");
  const locale = useLocale();
  const trend = subjectTrend(subject.components);
  const TrendIcon = trend ? TREND_ICON[trend] : null;
  const tuntas = isSubjectTuntas(subject, defaultKktp);
  const kktp = subjectEffectiveKktp(subject, defaultKktp);
  const score = subject.report_score ?? subject.average;
  // The footer only adds something when the average differs from the
  // report score shown large above it (a teacher's manual override).
  const showAverage =
    subject.average !== undefined &&
    subject.report_score !== undefined &&
    formatScore(subject.average, locale) !== formatScore(subject.report_score, locale);

  return (
    <Card data-testid={`my-grades-subject-card-${subject.subject_id}`}>
      <CardHeader
        action={
          tuntas !== undefined && (
            <Badge tone={tuntas ? "success" : "warning"} size="sm" dot>
              {tuntas ? t("tuntasBadge") : t("notTuntasBadge")}
            </Badge>
          )
        }
      >
        <CardTitle as="h2">{subjectName}</CardTitle>
        {trend && TrendIcon && (
          <CardDescription className={cn("flex items-center gap-1", TREND_CLASS[trend])}>
            <TrendIcon className="size-3.5" aria-hidden="true" />
            {t(`trend.${trend}`)}
          </CardDescription>
        )}
      </CardHeader>

      {score !== undefined && (
        <CardContent className="flex flex-col gap-2 pt-0">
          <span className="text-display text-fg tabular-nums">{formatScore(score, locale)}</span>
          <Progress
            variant="meter"
            value={score}
            max={scaleMax}
            tone={tuntas ? "success" : "warning"}
            label={t("kktpLine", { kktp })}
            valueLabel={
              tuntas
                ? t("aboveKktp")
                : t("belowKktpBy", { points: formatScore(kktp - score, locale) })
            }
            // The KKTP drawn on the scale; the label above already names it.
            markers={[{ value: kktp }]}
          />
        </CardContent>
      )}

      {subject.components.length === 0 ? (
        <CardFooter>
          <p className="text-body-sm text-fg-muted">{t("noComponents")}</p>
        </CardFooter>
      ) : (
        <List dense>
          {subject.components.map((component) => (
            <ListRow
              key={component.code}
              title={component.code}
              meta={tKind(component.kind)}
              trailing={
                <span className="flex items-center gap-2">
                  {component.kktp !== undefined && component.score < component.kktp && (
                    <Badge tone="warning" size="sm">
                      {t("belowKktp")}
                    </Badge>
                  )}
                  <span className="text-label text-fg tabular-nums">
                    {formatScore(component.score, locale)}
                  </span>
                </span>
              }
            />
          ))}
        </List>
      )}

      {showAverage && subject.average !== undefined && (
        <CardFooter className="border-t border-line pt-3 text-body-sm text-fg-muted">
          {t("average", { score: formatScore(subject.average, locale) })}
        </CardFooter>
      )}
    </Card>
  );
}
