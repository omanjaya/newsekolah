"use client";

import { formatDateTime, type Locale } from "@newsekolah/i18n";
import {
  Alert,
  Card,
  CardHeader,
  CardTitle,
  DataList,
  DataListItem,
  EmptyState,
  IconCircle,
  List,
  ListRow,
  SkeletonDetail,
  SkeletonList,
  Stat,
  StatGrid,
  TextLink,
  cn,
  domainIcons,
} from "@newsekolah/ui";
import {
  CalendarX,
  FileWarning,
  MessagesSquare,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { CSSProperties, ReactElement } from "react";
import { useMemo } from "react";

import { QueryError } from "../../../components/query-error";
import { isNotFoundError } from "../../../lib/api/not-found";
import { formatCalendarDate } from "../../../lib/format-calendar-date";
import { useModuleEnabled } from "../../../lib/modules/use-module-enabled";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { useStudentRiskQuery } from "../../analytics/api";
import { StudentRiskPanel } from "../../analytics/components/student-risk-panel";
import { useStudentDisciplineQuery } from "../../discipline/api";
import { useStudentCounselingsQuery } from "../../discipline/api-counseling-extras";
import { useCounselingAccess } from "../../discipline/lib/counseling-access";
import { DEFAULT_SCORE_DECIMALS, formatScore } from "../../grading/lib/format-score";
import { useMentorStudentSnapshotQuery } from "../../mentoring/api";
import {
  SnapshotAttendanceSection,
  SnapshotDisciplineSection,
} from "../../mentoring/components/student-snapshot-sections";
import { useUserQuery } from "../../school/api";
import { studentProfileHref } from "../href";

/** The stat row enters one tile after another, once (docs/07: motion, content enter). */
function enterStep(index: number): CSSProperties {
  return { "--stagger": index } as CSSProperties;
}

/** `value` rounded to `decimals` places, so a change too small for the
 * scale's precision reads as no change rather than as "0,00". */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Most events the overview's history lists before pointing at the tabs. */
const HISTORY_LIMIT = 6;

/**
 * The profile's first tab: the student's numbers as one row of themed
 * stats, the risk status (one quiet line when all is well, the reasons
 * when not), the biodata and the latest events as a timeline. Each part
 * shows only when the reader may read its endpoint.
 */
export function StudentOverviewTab({ studentId }: { studentId: string }): ReactElement {
  const canRisk = useCan("view_early_warning");
  const canUsers = useCan("view_users");
  const mentoringOn = useModuleEnabled("mentoring");
  const canSnapshot = useCan("view_mentoring") && mentoringOn;
  const risk = useStudentRiskQuery(studentId, canRisk);
  const disciplineOn = useModuleEnabled("discipline");
  const canDiscipline = useCan("view_discipline");
  const canCounsel = useCounselingAccess().canRead;
  const hasHistory = (canDiscipline || canCounsel) && disciplineOn;

  return (
    <div className="flex flex-col gap-6">
      {canRisk && <RiskStats studentId={studentId} />}
      {canRisk && risk.data && risk.data.level !== "none" && (
        <Card padding="md">
          <StudentRiskPanel studentId={studentId} />
        </Card>
      )}
      {!canRisk && canSnapshot && <SnapshotOverview studentId={studentId} />}
      <div
        className={cn(
          "grid gap-6",
          canUsers && hasHistory && "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
        )}
      >
        {canUsers && <StudentBiodata studentId={studentId} />}
        <StudentHistory studentId={studentId} />
      </div>
    </div>
  );
}

function RiskStats({ studentId }: { studentId: string }): ReactElement {
  const t = useTranslations("app.studentProfile.overview");
  const tRisk = useTranslations("app.analytics.detail");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const disciplineOn = useModuleEnabled("discipline");
  const gradingOn = useModuleEnabled("grading");
  const risk = useStudentRiskQuery(studentId);
  // Points and letters come from discipline itself, the same source as the
  // timeline under them, so the two can never disagree; the risk result
  // (a stored score) only supplies them for a reader without discipline.
  const canDiscipline = useCan("view_discipline") && disciplineOn;
  const live = useStudentDisciplineQuery(studentId, canDiscipline);
  const loading = risk.isLoading || (canDiscipline && live.isLoading);
  // No stored result for this student this year (not computed yet, or
  // outside the reader's class): an answer, not a failure to retry.
  if (!risk.data && isNotFoundError(risk.error)) {
    return (
      <EmptyState
        icon={<ShieldCheck aria-hidden="true" />}
        title={tRisk("noResultTitle")}
        description={tRisk("noResultBody")}
      />
    );
  }
  if (risk.isError && !risk.data) {
    return <QueryError retry={() => void risk.refetch()} error={risk.error} />;
  }
  const signals = risk.data?.signals;
  const discipline = live.data
    ? {
        points: live.data.total_points,
        active: live.data.records.filter((record) => !record.is_voided).length,
        letters: live.data.letters.length,
      }
    : {
        points: signals?.discipline_points ?? 0,
        active: signals?.active_violation_count ?? 0,
        letters: signals?.warning_letter_count ?? 0,
      };
  // The early-warning signal counts only alpha (unexcused) days; a sick or
  // excused day is not an absence there. So the card shows that count by
  // name instead of an attendance percentage that read a sick day as present.
  const unexcused =
    signals?.has_attendance && signals.considered_days > 0 ? signals.absent_days : undefined;
  // The active term's average stands on its own, as the below-KKTP count
  // of the same grades does; only the change needs a previous term.
  const hasGrades = (signals?.scored_subjects ?? 0) > 0;
  // At the grading scale's precision, as the gradebook and the student's
  // own grades page show the same average (55,08, not 55,1).
  const decimals = signals?.score_decimals ?? DEFAULT_SCORE_DECIMALS;
  const gradeDelta =
    signals?.has_grade_trend && signals.previous_average > 0
      ? roundTo(signals.current_average - signals.previous_average, decimals)
      : undefined;

  return (
    <div className="flex flex-col gap-3">
      <StatGrid variant="tiles" aria-label={t("statsLabel")}>
        <Stat
          icon={<CalendarX />}
          className="animate-enter"
          style={enterStep(0)}
          // An absence count, so never the green of a good figure: amber
          // once there is an alpha day, as the discipline tiles beside it
          // turn red and amber, and a quiet hue while there is none.
          tone={unexcused ? "amber" : "purple"}
          label={t("unexcusedAbsence")}
          value={unexcused ?? "–"}
          hint={
            signals?.has_attendance
              ? t("unexcusedOf", { days: signals.considered_days })
              : t("noAttendance")
          }
          loading={loading}
        />
        {disciplineOn && (
          <Stat
            className="animate-enter"
            style={enterStep(1)}
            icon={<ShieldAlert />}
            tone="red"
            label={t("disciplinePoints")}
            value={discipline.points}
            hint={t("activeViolations", { n: discipline.active })}
            loading={loading}
          />
        )}
        {disciplineOn && (
          <Stat
            className="animate-enter"
            style={enterStep(2)}
            icon={<FileWarning />}
            tone="amber"
            label={t("warningLetters")}
            value={discipline.letters}
            loading={loading}
          />
        )}
        {gradingOn && (
          <Stat
            className="animate-enter"
            style={enterStep(3)}
            icon={<TrendingUp />}
            tone="blue"
            label={t("averageGrade")}
            value={hasGrades && signals ? signals.current_average : "–"}
            formatValue={(value) => formatScore(value, locale, decimals)}
            hint={
              !hasGrades ? t("noGrades") : signals?.has_grade_trend ? undefined : t("noGradeTrend")
            }
            delta={
              gradeDelta === undefined || gradeDelta === 0
                ? undefined
                : {
                    value: t("gradeDelta", {
                      delta: formatScore(Math.abs(gradeDelta), locale, decimals),
                    }),
                    direction: gradeDelta > 0 ? "up" : "down",
                  }
            }
            loading={loading}
          />
        )}
      </StatGrid>
      {risk.data?.level === "none" && (
        <Alert
          tone="success"
          title={t("noRisk")}
          action={
            <span className="text-caption text-fg-muted">
              {t("freshness", {
                time: formatDateTime(risk.data.computed_at, {
                  locale,
                  timeZone: me?.tenant.timezone,
                }),
              })}
            </span>
          }
        />
      )}
    </div>
  );
}

function SnapshotOverview({ studentId }: { studentId: string }): ReactElement {
  const snapshot = useMentorStudentSnapshotQuery(studentId);
  if (snapshot.isError && !snapshot.data) {
    return <QueryError retry={() => void snapshot.refetch()} error={snapshot.error} />;
  }
  if (!snapshot.data) return <SkeletonDetail rows={4} />;
  return (
    <div className="flex flex-col gap-6">
      <SnapshotAttendanceSection snapshot={snapshot.data} />
      <SnapshotDisciplineSection snapshot={snapshot.data} />
    </div>
  );
}

function StudentBiodata({ studentId }: { studentId: string }): ReactElement {
  const t = useTranslations("app.studentProfile.biodata");
  const format = useFormatter();
  const user = useUserQuery(studentId);
  const profile = user.data?.profile;
  const birth = [
    profile?.birth_place,
    profile?.birth_date ? formatCalendarDate(format, profile.birth_date) : undefined,
  ]
    .filter(Boolean)
    .join(", ");
  const address = [profile?.address, profile?.district, profile?.city].filter(Boolean).join(", ");

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
      </CardHeader>
      <div className="px-5 pb-5">
        {user.isLoading ? (
          <SkeletonDetail rows={6} />
        ) : user.isError ? (
          <QueryError retry={() => void user.refetch()} error={user.error} />
        ) : (
          <DataList layout="stacked" columns={2}>
            <DataListItem label={t("nis")}>{profile?.nis}</DataListItem>
            <DataListItem label={t("nisn")}>{profile?.nisn}</DataListItem>
            <DataListItem label={t("gender")}>
              {profile?.gender ? t(`genders.${profile.gender}`) : undefined}
            </DataListItem>
            <DataListItem label={t("birth")}>{birth}</DataListItem>
            <DataListItem label={t("religion")}>{profile?.religion}</DataListItem>
            <DataListItem label={t("entryYear")}>{profile?.entry_year}</DataListItem>
            <DataListItem label={t("previousSchool")}>{profile?.previous_school}</DataListItem>
            <DataListItem label={t("contact")}>
              {[user.data?.phone, user.data?.email].filter(Boolean).join(" · ")}
            </DataListItem>
            <DataListItem label={t("address")} fullWidth>
              {address}
            </DataListItem>
          </DataList>
        )}
      </div>
    </Card>
  );
}

interface HistoryEvent {
  id: string;
  /** "YYYY-MM-DD" or an ISO timestamp; compared as a string. */
  at: string;
  kind: "violation" | "letter" | "counseling";
  title: string;
  meta?: string;
}

/**
 * The latest discipline records, warning letters and counseling sessions
 * on one time line, newest first. A reader without either permission sees
 * nothing here; the full lists stay in their tabs.
 */
export function StudentHistory({ studentId }: { studentId: string }): ReactElement | null {
  const t = useTranslations("app.studentProfile.history");
  const format = useFormatter();
  const disciplineOn = useModuleEnabled("discipline");
  const canDiscipline = useCan("view_discipline") && disciplineOn;
  const canCounsel = useCounselingAccess().canRead && disciplineOn;
  const discipline = useStudentDisciplineQuery(studentId, canDiscipline);
  const counselings = useStudentCounselingsQuery(studentId, canCounsel);

  const events = useMemo<HistoryEvent[]>(() => {
    const list: HistoryEvent[] = [];
    for (const record of discipline.data?.records ?? []) {
      if (record.is_voided) continue;
      list.push({
        id: `v-${record.id}`,
        at: record.occurred_on,
        kind: "violation",
        title: record.type_name,
        meta: t("points", { n: record.points }),
      });
    }
    for (const letter of discipline.data?.letters ?? []) {
      list.push({
        id: `l-${letter.id}`,
        at: letter.issued_at,
        kind: "letter",
        title: letter.level_label,
        meta: letter.letter_number,
      });
    }
    for (const session of counselings.data?.data ?? []) {
      list.push({
        id: `c-${session.id}`,
        at: session.session_at,
        kind: "counseling",
        title: session.title,
        meta: t("counseling"),
      });
    }
    return list.sort((a, b) => b.at.localeCompare(a.at)).slice(0, HISTORY_LIMIT);
  }, [counselings.data, discipline.data, t]);

  if (!canDiscipline && !canCounsel) return null;
  const loading = discipline.isLoading || counselings.isLoading;

  return (
    <Card>
      <CardHeader
        action={
          // An empty history has nothing to open the full list for.
          canDiscipline && (loading || events.length > 0) ? (
            <TextLink href={studentProfileHref(studentId, "discipline")}>{t("seeAll")}</TextLink>
          ) : undefined
        }
      >
        <CardTitle as="h2">{t("title")}</CardTitle>
      </CardHeader>
      {loading ? (
        <div className="px-5 pb-5">
          <SkeletonList rows={3} leading />
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={<domainIcons.violation aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <List variant="inset">
          {events.map((event) => (
            <ListRow
              key={event.id}
              leading={
                <IconCircle
                  size="sm"
                  tone={
                    event.kind === "violation"
                      ? "red"
                      : event.kind === "letter"
                        ? "amber"
                        : "purple"
                  }
                >
                  {event.kind === "violation" ? (
                    <ShieldAlert />
                  ) : event.kind === "letter" ? (
                    <FileWarning />
                  ) : (
                    <MessagesSquare />
                  )}
                </IconCircle>
              }
              title={event.title}
              meta={event.meta}
              trailing={
                // A violation carries the day it happened; a letter or a
                // session is an instant, placed in the school's zone.
                event.at.length === 10
                  ? formatCalendarDate(format, event.at)
                  : format.dateTime(new Date(event.at), {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
              }
            />
          ))}
        </List>
      )}
    </Card>
  );
}
