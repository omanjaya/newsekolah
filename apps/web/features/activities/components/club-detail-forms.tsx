"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, DatePicker, DialogFooter, Field, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { useCreateMeetingMutation, useJoinClubMutation } from "../api";

import { StudentPicker } from "./student-picker";

/**
 * Enrolls one student in a club: who, and from which day. Both are
 * required, marked on their labels and checked on submit, so the button
 * stays enabled and says what is missing.
 */
export function JoinMemberForm({
  clubId,
  onDone,
}: {
  clubId: string;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.activities.clubDetail.members");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const join = useJoinClubMutation(clubId);
  const { me } = useSession();
  const [studentId, setStudentId] = useState("");
  const [joinedOn, setJoinedOn] = useState(() => todayInZone(me?.tenant.timezone));
  const [attempted, setAttempted] = useState(false);
  const errors = {
    student: studentId === "" ? t("errors.student") : undefined,
    joinedOn: joinedOn === "" ? t("errors.joinedOn") : undefined,
  };
  const valid = Object.values(errors).every((error) => error === undefined);
  const shown = (error: string | undefined) => (attempted ? error : undefined);

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setAttempted(true);
        if (!valid || join.isPending) return;
        join.mutate(
          { student_user_id: studentId, joined_on: joinedOn },
          {
            onSuccess: () => {
              toast.success(t("joined"));
              onDone();
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
      <Field label={t("studentId")} required error={shown(errors.student)}>
        <StudentPicker value={studentId} onChange={setStudentId} />
      </Field>
      <Field label={t("joinedOn")} required error={shown(errors.joinedOn)}>
        <DatePicker value={joinedOn} required onChange={setJoinedOn} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={join.isPending}>
          {t("join")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Puts one meeting on a club's list, so its attendance can be taken. */
export function ScheduleMeetingForm({
  clubId,
  onDone,
}: {
  clubId: string;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.activities.clubDetail.meetings");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const createMeeting = useCreateMeetingMutation(clubId);
  const { me } = useSession();
  const [meetingDate, setMeetingDate] = useState(() => todayInZone(me?.tenant.timezone));
  const [attempted, setAttempted] = useState(false);
  const error = meetingDate === "" ? t("errors.meetingDate") : undefined;

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setAttempted(true);
        if (error || createMeeting.isPending) return;
        createMeeting.mutate(
          { meeting_date: meetingDate },
          {
            onSuccess: () => {
              toast.success(t("scheduled"));
              onDone();
            },
            onError: (mutationError) => {
              toast.error(
                mutationError instanceof ApiError
                  ? apiErrorMessage(mutationError.code)
                  : apiErrorMessage("UNKNOWN"),
              );
            },
          },
        );
      }}
    >
      <Field label={t("meetingDate")} required error={attempted ? error : undefined}>
        <DatePicker value={meetingDate} required onChange={setMeetingDate} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={createMeeting.isPending}>
          {t("schedule")}
        </Button>
      </DialogFooter>
    </form>
  );
}
