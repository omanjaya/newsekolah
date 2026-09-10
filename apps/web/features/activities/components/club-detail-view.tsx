"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  Input,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import {
  type AttendanceStatus,
  useClubMembersQuery,
  useCreateMeetingMutation,
  useExtracurricularQuery,
  useJoinClubMutation,
  useLeaveClubMutation,
  useMeetingRosterQuery,
  useMeetingsQuery,
  useRecordAttendanceMutation,
} from "../api";

const STATUS_OPTIONS: AttendanceStatus[] = ["H", "I", "S", "A"];

export function ClubDetailView({ clubId }: { clubId: string }): ReactElement {
  const t = useTranslations("app.activities.clubDetail");
  const { data: club } = useExtracurricularQuery(clubId);
  const [tab, setTab] = useState("members");
  const canManage = useCan("manage_extracurriculars");
  const canRecordAttendance = useCan("record_extracurricular_attendance");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
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
  const { data } = useClubMembersQuery(clubId, includeLeft);
  const join = useJoinClubMutation(clubId);
  const leave = useLeaveClubMutation();

  const [studentId, setStudentId] = useState("");
  const [joinedOn, setJoinedOn] = useState(() => new Date().toISOString().slice(0, 10));

  const members = data?.data ?? [];

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
            <Input
              value={studentId}
              onChange={(e) => {
                setStudentId(e.target.value);
              }}
              required
              placeholder={t("studentIdPlaceholder")}
            />
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
          <Button type="submit" loading={join.isPending}>
            {t("join")}
          </Button>
        </form>
      )}

      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={includeLeft}
          onChange={(e) => {
            setIncludeLeft(e.target.checked);
          }}
        />
        {t("includeLeft")}
      </label>

      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {members.length === 0 && (
          <li className="p-3 text-[13px] text-muted-foreground">{t("empty")}</li>
        )}
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 p-3 text-[13px]">
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{m.student_user_id}</span>
              <span className="text-muted-foreground">
                {m.joined_on}
                {m.left_on ? ` - ${m.left_on}` : ""}
              </span>
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
        ))}
      </ul>
    </div>
  );
}

function MeetingsPanel({ clubId }: { clubId: string }): ReactElement {
  const t = useTranslations("app.activities.clubDetail.meetings");
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

      <ul className="flex flex-col gap-2">
        {meetings.length === 0 && (
          <li className="text-[13px] text-muted-foreground">{t("empty")}</li>
        )}
        {meetings.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className="flex min-h-11 w-full items-center rounded-md border border-border p-3 text-left text-[13px] hover:bg-muted"
              onClick={() => {
                setSelectedMeeting(m.id === selectedMeeting ? null : m.id);
              }}
            >
              {m.meeting_date}
            </button>
            {selectedMeeting === m.id && <AttendanceRoster meetingId={m.id} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AttendanceRoster({ meetingId }: { meetingId: string }): ReactElement {
  const t = useTranslations("app.activities.clubDetail.meetings.roster");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { data } = useMeetingRosterQuery(meetingId);
  const record = useRecordAttendanceMutation(meetingId);

  const [studentId, setStudentId] = useState("");
  const [status, setStatus] = useState<AttendanceStatus>("H");

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-md border border-border p-3">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          record.mutate(
            { student_user_id: studentId.trim(), status_code: status },
            {
              onSuccess: () => {
                toast.success(t("recorded"));
                setStudentId("");
              },
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
          <span className="font-medium">{t("studentId")}</span>
          <Input
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value);
            }}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("status")}</span>
          <select
            className="h-9 rounded-md border border-border bg-background px-2 text-[13px]"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as AttendanceStatus);
            }}
          >
            {STATUS_OPTIONS.map((code) => (
              <option key={code} value={code}>
                {t(`statuses.${code}`)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" loading={record.isPending}>
          {t("save")}
        </Button>
      </form>

      <ul className="flex flex-col divide-y divide-border">
        {(data?.entries ?? []).map((entry) => (
          <li key={entry.id} className="flex items-center justify-between py-2 text-[13px]">
            <span>{entry.student_user_id}</span>
            <Badge>{t(`statuses.${entry.status_code}`)}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
