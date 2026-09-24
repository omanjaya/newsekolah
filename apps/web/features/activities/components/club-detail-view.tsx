"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Input,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from "@newsekolah/ui";
import { CalendarClock, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { formatDisplayName } from "../../../lib/text/format-name";
import { useDirectoryQuery } from "../../reference/api";
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
    <div className="flex flex-col gap-6 p-4 pb-24 md:p-6 md:pb-24">
      <PageHeader eyebrow={t("eyebrow")} title={club?.name ?? "..."} />
      {club?.description && <p className="text-[13px] text-muted-foreground">{club.description}</p>}
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
    </div>
  );
}

function MembersPanel({ clubId, canManage }: { clubId: string; canManage: boolean }): ReactElement {
  const t = useTranslations("app.activities.clubDetail.members");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const [includeLeft, setIncludeLeft] = useState(false);
  const [search, setSearch] = useState("");
  const { data } = useClubMembersQuery(clubId, includeLeft);
  const directory = useDirectoryQuery("student");
  const join = useJoinClubMutation(clubId);
  const leave = useLeaveClubMutation();

  const [studentId, setStudentId] = useState("");
  const [joinedOn, setJoinedOn] = useState(() => new Date().toISOString().slice(0, 10));

  const nameById = useMemo(
    () => new Map((directory.data?.data ?? []).map((u) => [u.id, u.name])),
    [directory.data],
  );

  const members = data?.data ?? [];
  const visible = members.filter((m) => {
    if (!search) return true;
    const name = nameById.get(m.student_user_id) ?? "";
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
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("studentId")}</span>
            <StudentPicker value={studentId} onChange={setStudentId} />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">{t("joinedOn")}</span>
            <Input
              type="date"
              value={joinedOn}
              onChange={(e) => {
                setJoinedOn(e.target.value);
              }}
              required
            />
          </label>
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
        <label className="flex min-h-11 items-center gap-2 text-[13px] sm:min-h-0">
          <Checkbox
            checked={includeLeft}
            onCheckedChange={(v) => {
              setIncludeLeft(v === true);
            }}
          />
          {t("includeLeft")}
        </label>
      </div>

      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {visible.length === 0 && (
          <li className="p-3">
            <EmptyState
              icon={<Users aria-hidden="true" />}
              title={search ? t("noMatch") : t("empty")}
            />
          </li>
        )}
        {visible.map((m) => {
          const name = nameById.get(m.student_user_id) ?? t("unknownStudent");
          return (
            <li key={m.id} className="flex items-center justify-between gap-2 p-3 text-[13px]">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={name} size="sm" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{formatDisplayName(name)}</span>
                  <span className="text-muted-foreground">
                    {m.joined_on}
                    {m.left_on ? ` - ${m.left_on}` : ""}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={m.status === "active" ? "accent" : "neutral"}>
                  {t(`status.${m.status}`)}
                </Badge>
                {canManage && m.status === "active" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      leave.mutate(
                        { membershipId: m.id, leftOn: new Date().toISOString().slice(0, 10) },
                        {
                          onSuccess: () => toast.success(t("left")),
                          onError: (error) =>
                            toast.error(
                              error instanceof ApiError
                                ? apiErrorMessage(error.code)
                                : apiErrorMessage("UNKNOWN"),
                            ),
                        },
                      );
                    }}
                  >
                    {t("leave")}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
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
  const [meetingDate, setMeetingDate] = useState(() => new Date().toISOString().slice(0, 10));
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
              onSuccess: () => toast.success(t("scheduled")),
              onError: (error) =>
                toast.error(
                  error instanceof ApiError
                    ? apiErrorMessage(error.code)
                    : apiErrorMessage("UNKNOWN"),
                ),
            },
          );
        }}
      >
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("meetingDate")}</span>
          <Input
            type="date"
            value={meetingDate}
            onChange={(e) => {
              setMeetingDate(e.target.value);
            }}
            required
          />
        </label>
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
              <button
                type="button"
                aria-expanded={selectedMeeting === m.id}
                className="flex min-h-11 w-full items-center rounded-md border border-border p-3 text-left text-[13px] hover:bg-muted"
                onClick={() => {
                  setSelectedMeeting(m.id === selectedMeeting ? null : m.id);
                }}
              >
                {formatDate(m.meeting_date, { locale })}
              </button>
              {selectedMeeting === m.id && (
                <MeetingAttendanceEditor clubId={clubId} meetingId={m.id} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
