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
  domainIcons,
} from "@newsekolah/ui";
import { CalendarCheck, FileWarning, MessagesSquare, ShieldAlert, TrendingUp } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { CSSProperties, ReactElement } from "react";
import { useMemo } from "react";

import { QueryError } from "../../../components/query-error";
import { useModuleEnabled } from "../../../lib/modules/use-module-enabled";
import { useCan } from "../../../lib/session/session-provider";
import { formatCalendarDate } from "../../academic/lib/format-calendar-date";
import { useStudentRiskQuery } from "../../analytics/api";
import { StudentRiskPanel } from "../../analytics/components/student-risk-panel";
import { useStudentDisciplineQuery } from "../../discipline/api";
import { useStudentCounselingsQuery } from "../../discipline/api-counseling-extras";
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

  return (
    <div className="flex flex-col gap-6">
      {canRisk && <RiskStats studentId={studentId} />}
      {canRisk && risk.data && risk.data.level !== "none" && (
        <Card padding="md">
          <StudentRiskPanel studentId={studentId} />
        </Card>
      )}
      {!canRisk && canSnapshot && <SnapshotOverview studentId={studentId} />}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {canUsers && <StudentBiodata studentId={studentId} />}
        <StudentHistory studentId={studentId} />
      </div>
    </div>
  );
}

function RiskStats({ studentId }: { studentId: string }): ReactElement {
  const t = useTranslations("app.studentProfile.overview");
  const locale = useLocale() as Locale;
  const disciplineOn = useModuleEnabled("discipline");
  const gradingOn = useModuleEnabled("grading");
  const risk = useStudentRiskQuery(studentId);
  const loading = risk.isLoading;
  if (risk.isError && !risk.data) {
    return <QueryError retry={() => void risk.refetch()} error={risk.error} />;
  }
  const signals = risk.data?.signals;
  const attendance =
    signals?.has_attendance && signals.considered_days > 0
      ? Math.round(
          ((signals.considered_days - signals.absent_days) / signals.considered_days) * 100,
        )
      : undefined;
  const gradeDelta =
    signals?.has_grade_trend && signals.previous_average > 0
      ? Math.round((signals.current_average - signals.previous_average) * 10) / 10
      : undefined;

  return (
    <div className="flex flex-col gap-3">
      <StatGrid variant="tiles" aria-label={t("statsLabel")}>
        <Stat
          icon={<CalendarCheck />}
          className="animate-enter"
          style={enterStep(0)}
          tone="green"
          label={t("attendance")}
          value={attendance === undefined ? "-" : `${attendance}%`}
          hint={
            signals?.has_attendance
              ? t("absentDays", { absent: signals.absent_days, days: signals.considered_days })
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
            value={signals?.discipline_points ?? 0}
            hint={t("activeViolations", { n: signals?.active_violation_count ?? 0 })}
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
            value={signals?.warning_letter_count ?? 0}
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
            value={signals?.has_grade_trend ? signals.current_average : "-"}
            formatValue={(value) => value.toLocaleString(locale, { maximumFractionDigits: 1 })}
            hint={signals?.has_grade_trend ? undefined : t("noGrades")}
            delta={
              gradeDelta === undefined || gradeDelta === 0
                ? undefined
                : {
                    value: t("gradeDelta", { delta: Math.abs(gradeDelta) }),
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
              {t("freshness", { time: formatDateTime(risk.data.computed_at, { locale }) })}
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
function StudentHistory({ studentId }: { studentId: string }): ReactElement | null {
  const t = useTranslations("app.studentProfile.history");
  const format = useFormatter();
  const disciplineOn = useModuleEnabled("discipline");
  const canDiscipline = useCan("view_discipline") && disciplineOn;
  const canCounsel = useCan("manage_counseling") && disciplineOn;
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
          canDiscipline ? (
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
              trailing={formatCalendarDate(format, event.at.slice(0, 10))}
            />
          ))}
        </List>
      )}
    </Card>
  );
}
