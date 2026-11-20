"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { Alert, Badge, List, ListRow, SectionHeader, SkeletonList } from "@newsekolah/ui";
import { CalendarRange, Trophy, Volleyball } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import type { Achievement, ActivityEvent, StudentMembership } from "../api";

/** The slice of a React Query result a section reads. */
export interface RecordQuery<T> {
  data: { data: T[] } | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * One student's activities record: their clubs, the activities they take
 * part in (when given) and their achievements. Shared by the student's
 * own page (/my-activities) and the student profile's activities tab, so
 * both read the same way. The student's own page lists this year's
 * achievements; the profile passes every year's (`achievementsAllYears`),
 * and the empty text says which.
 */
export function ActivitiesRecord({
  clubs,
  events,
  achievements,
  achievementsAllYears = false,
}: {
  clubs: RecordQuery<StudentMembership>;
  events?: RecordQuery<ActivityEvent>;
  achievements: RecordQuery<Achievement>;
  achievementsAllYears?: boolean;
}): ReactElement {
  const t = useTranslations("app.activities.record");
  const tStatus = useTranslations("app.activities.clubDetail.members.status");
  const tLevels = useTranslations("app.activities.achievements.levels");
  const locale = useLocale() as Locale;
  // Calendar dates from the API ("2026-11-28"), the same day everywhere.
  const day = (value: string) => formatDate(value, { locale, timeZone: "UTC" });

  const clubRows = [...(clubs.data?.data ?? [])].sort(
    // Current clubs first, then the most recent stint.
    (a, b) =>
      Number(b.status === "active") - Number(a.status === "active") ||
      b.joined_on.localeCompare(a.joined_on),
  );

  return (
    <div className="flex flex-col gap-6">
      <RecordSection
        title={t("clubsTitle")}
        query={clubs}
        count={clubRows.filter((club) => club.status === "active").length}
        empty={t("clubsEmpty")}
        loadError={t("loadError")}
      >
        {clubRows.map((club) => (
          <ListRow
            key={club.id}
            leading={<Volleyball aria-hidden="true" className="size-5 text-fg-muted" />}
            title={club.club_name}
            meta={
              club.left_on
                ? t("memberPeriod", { from: day(club.joined_on), to: day(club.left_on) })
                : t("joinedSince", { date: day(club.joined_on) })
            }
            trailing={
              <Badge tone={club.status === "active" ? "success" : "neutral"}>
                {tStatus(club.status)}
              </Badge>
            }
          />
        ))}
      </RecordSection>

      {events && (
        <RecordSection
          title={t("eventsTitle")}
          query={events}
          count={events.data?.data.length ?? 0}
          empty={t("eventsEmpty")}
          loadError={t("loadError")}
        >
          {(events.data?.data ?? []).map((event) => (
            <ListRow
              key={event.id}
              leading={<CalendarRange aria-hidden="true" className="size-5 text-fg-muted" />}
              title={event.name}
              meta={[
                event.start_date === event.end_date
                  ? day(event.start_date)
                  : t("dateRange", { from: day(event.start_date), to: day(event.end_date) }),
                event.location.trim() || undefined,
              ].filter((part): part is string => Boolean(part))}
            />
          ))}
        </RecordSection>
      )}

      <RecordSection
        title={t("achievementsTitle")}
        query={achievements}
        count={achievements.data?.data.length ?? 0}
        empty={t(achievementsAllYears ? "achievementsEmptyAllYears" : "achievementsEmpty")}
        loadError={t("loadError")}
      >
        {(achievements.data?.data ?? []).map((achievement) => (
          <ListRow
            key={achievement.id}
            leading={<Trophy aria-hidden="true" className="size-5 text-fg-muted" />}
            title={achievement.competition_name}
            meta={[tLevels(achievement.level), achievement.placement]}
            trailing={
              <span className="text-body-sm text-fg-muted tabular-nums">
                {day(achievement.achieved_on)}
              </span>
            }
          />
        ))}
      </RecordSection>
    </div>
  );
}

function RecordSection<T>({
  title,
  query,
  count,
  empty,
  loadError,
  children,
}: {
  title: string;
  query: RecordQuery<T>;
  count: number;
  empty: string;
  loadError: string;
  children: ReactNode;
}): ReactElement {
  const rows = query.data?.data ?? [];
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title={title} count={query.isLoading ? undefined : count} />
      {query.isLoading ? (
        <SkeletonList rows={2} framed />
      ) : query.isError ? (
        <Alert variant="danger" title={loadError} />
      ) : rows.length === 0 ? (
        <p className="text-body-sm text-fg-muted">{empty}</p>
      ) : (
        <List framed>{children}</List>
      )}
    </section>
  );
}
