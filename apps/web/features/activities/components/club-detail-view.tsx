"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  DataTableFilters,
  Dialog,
  DialogContent,
  Disclosure,
  DisclosureContent,
  DisclosureIndicator,
  DisclosureTrigger,
  EmptyState,
  List,
  ListRow,
  RowActionsMenu,
  SearchInput,
  SkeletonDetail,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from "@newsekolah/ui";
import { CalendarClock, CalendarPlus, UserMinus, UserPlus, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { RecordForbiddenPage, RecordNotFoundPage } from "../../../components/record-not-found";
import { isForbiddenError, isNotFoundError } from "../../../lib/api/not-found";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useDirectoryName, useDirectoryNames } from "../../reference/directory-names";
import {
  type Extracurricular,
  useClubMembersQuery,
  useExtracurricularQuery,
  useLeaveClubMutation,
  useMeetingsQuery,
} from "../api";
import { clubScheduleLabel } from "../lib/club-schedule";

import { JoinMemberForm, ScheduleMeetingForm } from "./club-detail-forms";
import { MeetingAttendanceEditor } from "./meeting-attendance-editor";

/** A calendar date from the API ("2026-11-17") as people read it, the same day everywhere. */
function useFormatDay(): (value: string) => string {
  const locale = useLocale() as Locale;
  return (value) => formatDate(value, { locale, timeZone: "UTC" });
}

/**
 * The club's facts under its name:
 * "Pembina Bu Sari · Jumat, 15.00 – 16.30 · Kuota 30 anggota · Lapangan".
 */
function useClubFacts(club: Extracurricular | undefined): string[] {
  const t = useTranslations("app.activities.clubDetail");
  const tClubs = useTranslations("app.activities.clubs");
  const locale = useLocale() as Locale;
  const coach = useDirectoryName(club?.coach_user_id);
  if (!club) return [];
  return [
    club.coach_user_id
      ? coach
        ? t("facts.coach", { name: formatDisplayName(coach.name) })
        : undefined
      : t("facts.noCoach"),
    clubScheduleLabel(club, (key) => tClubs(`weekdays.${key}`), locale),
    club.capacity ? t("facts.capacity", { count: club.capacity }) : t("facts.noLimit"),
    club.location.trim() || undefined,
  ].filter((fact): fact is string => Boolean(fact));
}

/**
 * One extracurricular: its facts in the header, then its members and (for
 * whoever records attendance) its meetings. Each tab's one action, enrolling
 * a member or scheduling a meeting, is the page's primary action and opens a
 * dialog; removing a member waits in the row's menu behind a confirmation.
 */
export function ClubDetailView({ clubId }: { clubId: string }): ReactElement {
  const t = useTranslations("app.activities.clubDetail");
  const clubQuery = useExtracurricularQuery(clubId);
  const club = clubQuery.data;
  const facts = useClubFacts(club);
  const canManage = useCan("manage_extracurriculars");
  const canRecordAttendance = useCan("record_extracurricular_attendance");
  const [tab, setTab] = useUrlState<string>(
    "tab",
    ["members", ...(canRecordAttendance ? ["meetings"] : [])],
    "members",
  );
  const [joining, setJoining] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const primaryAction =
    tab === "meetings" && canRecordAttendance ? (
      <Button
        icon={<CalendarPlus />}
        onClick={() => {
          setScheduling(true);
        }}
      >
        {t("meetings.add")}
      </Button>
    ) : tab === "members" && canManage ? (
      <Button
        icon={<UserPlus />}
        onClick={() => {
          setJoining(true);
        }}
      >
        {t("members.add")}
      </Button>
    ) : undefined;

  // Without the club there is nothing to enrol into or schedule: an unknown
  // or malformed id is a missing club, a club another teacher coaches is
  // the no-access page (a retry would only be refused again), any other
  // failure offers a retry, and the tabs wait for the club rather than
  // show an empty roster.
  if (!club) {
    if (clubQuery.isError && isNotFoundError(clubQuery.error)) {
      return (
        <RecordNotFoundPage
          title={t("notFoundTitle")}
          backHref="/activities/clubs"
          backLabel={t("backToClubs")}
        />
      );
    }
    if (clubQuery.isError && isForbiddenError(clubQuery.error)) {
      return (
        <RecordForbiddenPage
          error={clubQuery.error}
          backHref="/activities/clubs"
          backLabel={t("backToClubs")}
        />
      );
    }
    return (
      <AppPage nav={false}>
        {clubQuery.isError ? (
          <QueryError retry={() => clubQuery.refetch()} error={clubQuery.error} />
        ) : (
          <SkeletonDetail />
        )}
      </AppPage>
    );
  }

  return (
    <AppPage
      title={club.name}
      description={
        <>
          {club.description && <p>{club.description}</p>}
          {facts.length > 0 && (
            // Each fact stays whole: a wrap starts a new fact, never strands a dot.
            <p className="mt-1 flex flex-wrap gap-x-1.5 text-body-sm">
              {facts.map((fact, index) => (
                <span key={fact} className="whitespace-nowrap">
                  {index > 0 && <span aria-hidden="true">· </span>}
                  {fact}
                </span>
              ))}
            </p>
          )}
        </>
      }
      primaryAction={primaryAction}
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="underline" aria-label={t("tabsLabel")}>
          <TabsTrigger value="members">{t("tabs.members")}</TabsTrigger>
          {canRecordAttendance && <TabsTrigger value="meetings">{t("tabs.meetings")}</TabsTrigger>}
        </TabsList>
        <TabsContent value="members" className="pt-4">
          <MembersPanel clubId={clubId} canManage={canManage} />
        </TabsContent>
        {canRecordAttendance && (
          <TabsContent value="meetings" className="pt-4">
            <MeetingsPanel clubId={clubId} />
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={joining} onOpenChange={setJoining}>
        <DialogContent title={t("members.add")} description={club.name}>
          {joining && (
            <JoinMemberForm
              clubId={clubId}
              onDone={() => {
                setJoining(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={scheduling} onOpenChange={setScheduling}>
        <DialogContent title={t("meetings.add")} description={club.name}>
          {scheduling && (
            <ScheduleMeetingForm
              clubId={clubId}
              onDone={() => {
                setScheduling(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </AppPage>
  );
}

function MembersPanel({ clubId, canManage }: { clubId: string; canManage: boolean }): ReactElement {
  const t = useTranslations("app.activities.clubDetail.members");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const formatDay = useFormatDay();
  const [includeLeft, setIncludeLeft] = useState(false);
  const [search, setSearch] = useState("");
  const [leaving, setLeaving] = useState<{ id: string; name: string } | null>(null);
  const { data } = useClubMembersQuery(clubId, includeLeft);
  const leave = useLeaveClubMutation();
  const { me } = useSession();
  const today = todayInZone(me?.tenant.timezone);

  const members = data?.data ?? [];
  const nameById = useDirectoryNames(members.map((m) => m.student_user_id));
  const visible = members.filter((m) => {
    if (!search) return true;
    const name = nameById.get(m.student_user_id)?.name ?? "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          onClear={() => {
            setSearch("");
          }}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="sm:w-72"
        />
        <DataTableFilters
          filters={[
            {
              id: "includeLeft",
              label: t("includeLeft"),
              type: "boolean",
              value: includeLeft ? "true" : "",
              onChange: (value) => {
                setIncludeLeft(value === "true");
              },
            },
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Users aria-hidden="true" />}
          title={search ? t("noMatch") : t("empty")}
        />
      ) : (
        <List framed>
          {visible.map((m) => {
            const name = formatDisplayName(
              nameById.get(m.student_user_id)?.name ?? t("unknownStudent"),
            );
            return (
              <ListRow
                key={m.id}
                leading={<Avatar name={name} size={40} decorative />}
                title={name}
                meta={
                  m.left_on
                    ? t("memberPeriod", {
                        from: formatDay(m.joined_on),
                        to: formatDay(m.left_on),
                      })
                    : t("joinedSince", { date: formatDay(m.joined_on) })
                }
                // Active is the normal state; only a former member is marked.
                trailing={
                  m.status === "active" ? undefined : (
                    <Badge tone="neutral">{t(`status.${m.status}`)}</Badge>
                  )
                }
                action={
                  canManage && m.status === "active" ? (
                    <RowActionsMenu
                      ariaLabel={t("rowActions", { name })}
                      items={[
                        {
                          label: t("leave"),
                          icon: <UserMinus />,
                          tone: "danger",
                          onClick: () => {
                            setLeaving({ id: m.id, name });
                          },
                        },
                      ]}
                    />
                  ) : undefined
                }
              />
            );
          })}
        </List>
      )}

      <ConfirmDialog
        open={leaving !== null}
        onOpenChange={(open) => {
          if (!open) setLeaving(null);
        }}
        title={t("leaveTitle", { name: leaving?.name ?? "" })}
        description={t("leaveBody")}
        confirmLabel={t("leave")}
        destructive
        confirming={leave.isPending}
        onConfirm={async () => {
          if (!leaving) return;
          try {
            await leave.mutateAsync({ membershipId: leaving.id, leftOn: today });
            toast.success(t("left"));
            setLeaving(null);
          } catch (error) {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          }
        }}
      />
    </div>
  );
}

function MeetingsPanel({ clubId }: { clubId: string }): ReactElement {
  const t = useTranslations("app.activities.clubDetail.meetings");
  const formatDay = useFormatDay();
  const { data } = useMeetingsQuery(clubId);
  const [selectedMeeting, setSelectedMeeting] = useState<string | null>(null);

  const meetings = data?.data ?? [];

  if (meetings.length === 0) {
    return <EmptyState icon={<CalendarClock aria-hidden="true" />} title={t("empty")} />;
  }
  return (
    <ul className="flex flex-col gap-2">
      {meetings.map((m) => (
        <li key={m.id}>
          <Disclosure
            open={selectedMeeting === m.id}
            onOpenChange={(open) => {
              setSelectedMeeting(open ? m.id : null);
            }}
          >
            <DisclosureTrigger className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-border p-3 text-body-sm transition-colors hover:bg-state-hover">
              {formatDay(m.meeting_date)}
              <DisclosureIndicator />
            </DisclosureTrigger>
            {/* Only the open meeting loads its roster. */}
            <DisclosureContent>
              {selectedMeeting === m.id && (
                <MeetingAttendanceEditor clubId={clubId} meetingId={m.id} />
              )}
            </DisclosureContent>
          </Disclosure>
        </li>
      ))}
    </ul>
  );
}
