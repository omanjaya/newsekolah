"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  DatePicker,
  Disclosure,
  DisclosureContent,
  DisclosureIndicator,
  DisclosureTrigger,
  EmptyState,
  Field,
  Input,
  List,
  ListRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from "@newsekolah/ui";
import { CalendarClock, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useDirectoryNames } from "../../reference/directory-names";
import {
  useClubMembersQuery,
  useCreateMeetingMutation,
  useExtracurricularQuery,
  useJoinClubMutation,
  useLeaveClubMutation,
  useMeetingsQuery,
} from "../api";

import { MeetingAttendanceEditor } from "./meeting-attendance-editor";
import { StudentPicker } from "./student-picker";

export function ClubDetailView({ clubId }: { clubId: string }): ReactElement {
  const t = useTranslations("app.activities.clubDetail");
  const { data: club } = useExtracurricularQuery(clubId);
  const canManage = useCan("manage_extracurriculars");
  const canRecordAttendance = useCan("record_extracurricular_attendance");
  const [tab, setTab] = useUrlState<string>(
    "tab",
    ["members", ...(canRecordAttendance ? ["meetings"] : [])],
    "members",
  );

  return (
    <AppPage title={club?.name} description={club?.description}>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
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
    </AppPage>
  );
}

function MembersPanel({ clubId, canManage }: { clubId: string; canManage: boolean }): ReactElement {
  const t = useTranslations("app.activities.clubDetail.members");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const [includeLeft, setIncludeLeft] = useState(false);
  const [search, setSearch] = useState("");
  const { data } = useClubMembersQuery(clubId, includeLeft);
  const join = useJoinClubMutation(clubId);
  const leave = useLeaveClubMutation();
  const { me } = useSession();
  const today = todayInZone(me?.tenant.timezone);

  const [studentId, setStudentId] = useState("");
  const [joinedOn, setJoinedOn] = useState(today);

  const members = data?.data ?? [];
  const nameById = useDirectoryNames(members.map((m) => m.student_user_id));
  const visible = members.filter((m) => {
    if (!search) return true;
    const name = nameById.get(m.student_user_id)?.name ?? "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            join.mutate(
              { student_user_id: studentId.trim(), joined_on: joinedOn },
              {
                onSuccess: () => {
                  toast.success(t("joined"));
                  setStudentId("");
                },
                onError: (error) => {
                  toast.error(
                    error instanceof ApiError
                      ? apiErrorMessage(error.code)
                      : apiErrorMessage("UNKNOWN"),
                  );
                },
              },
            );
          }}
        >
          <Field label={t("studentId")}>
            <StudentPicker value={studentId} onChange={setStudentId} />
          </Field>
          <Field label={t("joinedOn")}>
            <DatePicker value={joinedOn} required onChange={setJoinedOn} />
          </Field>
          <Button type="submit" disabled={!studentId} loading={join.isPending}>
            {t("join")}
          </Button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="w-full sm:w-64"
        />
        <Checkbox
          label={t("includeLeft")}
          checked={includeLeft}
          onCheckedChange={(v) => {
            setIncludeLeft(v === true);
          }}
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
            const name = nameById.get(m.student_user_id)?.name ?? t("unknownStudent");
            return (
              <ListRow
                key={m.id}
                leading={<Avatar name={name} size={40} decorative />}
                title={formatDisplayName(name)}
                meta={`${m.joined_on}${m.left_on ? ` - ${m.left_on}` : ""}`}
                trailing={
                  <Badge tone={m.status === "active" ? "success" : "neutral"}>
                    {t(`status.${m.status}`)}
                  </Badge>
                }
                action={
                  canManage && m.status === "active" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        leave.mutate(
                          { membershipId: m.id, leftOn: today },
                          {
                            onSuccess: () => {
                              toast.success(t("left"));
                            },
                            onError: (error) => {
                              toast.error(
                                error instanceof ApiError
                                  ? apiErrorMessage(error.code)
                                  : apiErrorMessage("UNKNOWN"),
                              );
                            },
                          },
                        );
                      }}
                    >
                      {t("leave")}
                    </Button>
                  ) : undefined
                }
              />
            );
          })}
        </List>
      )}
    </div>
  );
}

function MeetingsPanel({ clubId }: { clubId: string }): ReactElement {
  const t = useTranslations("app.activities.clubDetail.meetings");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { data } = useMeetingsQuery(clubId);
  const createMeeting = useCreateMeetingMutation(clubId);
  const { me } = useSession();
  const [meetingDate, setMeetingDate] = useState(() => todayInZone(me?.tenant.timezone));
  const [selectedMeeting, setSelectedMeeting] = useState<string | null>(null);

  const meetings = data?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          createMeeting.mutate(
            { meeting_date: meetingDate },
            {
              onSuccess: () => {
                toast.success(t("scheduled"));
              },
              onError: (error) => {
                toast.error(
                  error instanceof ApiError
                    ? apiErrorMessage(error.code)
                    : apiErrorMessage("UNKNOWN"),
                );
              },
            },
          );
        }}
      >
        <Field label={t("meetingDate")}>
          <DatePicker value={meetingDate} required onChange={setMeetingDate} />
        </Field>
        <Button type="submit" loading={createMeeting.isPending}>
          {t("schedule")}
        </Button>
      </form>

      {meetings.length === 0 ? (
        <EmptyState icon={<CalendarClock aria-hidden="true" />} title={t("empty")} />
      ) : (
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
                  {formatDate(m.meeting_date, { locale })}
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
      )}
    </div>
  );
}
