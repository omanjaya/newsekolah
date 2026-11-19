"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  DateTimeField,
  DialogFooter,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { businessNow } from "../../../lib/simulation/clock";
import { isoToZonedLocal, zonedLocalToIso } from "../../../lib/tenant-date";
import {
  type MentorGroupMember,
  type MentorMeetingNote,
  useCreateMentorMeetingNoteMutation,
  useUpdateMentorMeetingNoteMutation,
} from "../api";

const KINDS = ["group", "individual"] as const;

export function MentorMeetingNoteForm({
  groupId,
  members,
  studentNames,
  initial,
  onDone,
}: {
  groupId: string;
  members: MentorGroupMember[];
  studentNames: Map<string, string>;
  initial?: MentorMeetingNote;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.mentoring.notes.form");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { me } = useSession();
  const timeZone = me?.tenant.timezone;

  const create = useCreateMentorMeetingNoteMutation(groupId);
  const update = useUpdateMentorMeetingNoteMutation();

  const [metAt, setMetAt] = useState(isoToZonedLocal(initial?.met_at ?? businessNow(), timeZone));
  const [kind, setKind] = useState<(typeof KINDS)[number]>(initial?.kind ?? "group");
  const [attendeeIds, setAttendeeIds] = useState<Set<string>>(
    new Set(initial?.attendee_user_ids ?? []),
  );
  const [topic, setTopic] = useState(initial?.topic ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [agreedActions, setAgreedActions] = useState(initial?.agreed_actions ?? "");

  const pending = create.isPending || update.isPending;
  const attendeeIdList = [...attendeeIds];

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const metAtIso = zonedLocalToIso(metAt, timeZone);
        if (!metAtIso || attendeeIdList.length === 0 || !topic.trim() || !content.trim()) return;
        const body = {
          met_at: metAtIso,
          kind,
          attendee_user_ids: attendeeIdList,
          topic: topic.trim(),
          content: content.trim(),
          agreed_actions: agreedActions.trim() || undefined,
        };
        const onSuccess = () => {
          toast.success(t("saved"));
          onDone();
        };
        const onError = (error: unknown) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        };
        if (initial) {
          update.mutate({ noteId: initial.id, ...body }, { onSuccess, onError });
        } else {
          create.mutate(body, { onSuccess, onError });
        }
      }}
    >
      <DateTimeField
        value={metAt}
        onChange={setMetAt}
        dateLabel={t("metDate")}
        timeLabel={t("metTime")}
        required
      />
      <Field label={t("kind")}>
        <Select
          options={KINDS.map((k) => ({ value: k, label: t(`kindOptions.${k}`) }))}
          value={kind}
          onValueChange={(v) => {
            setKind(v as (typeof KINDS)[number]);
          }}
        />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-label text-fg">{t("attendees")}</legend>
        <Card tone="sunken" className="max-h-52 overflow-y-auto p-1">
          {members.map((member) => (
            <Checkbox
              key={member.id}
              checked={attendeeIds.has(member.student_user_id)}
              onCheckedChange={(checked) => {
                setAttendeeIds((prev) => {
                  const next = new Set(prev);
                  if (checked) next.add(member.student_user_id);
                  else next.delete(member.student_user_id);
                  return next;
                });
              }}
              containerClassName="min-h-11 items-center rounded-md px-3 py-0 transition-colors hover:bg-state-hover md:pointer-fine:py-0"
              label={studentNames.get(member.student_user_id) ?? t("unknownStudent")}
            />
          ))}
        </Card>
        {attendeeIdList.length === 0 && (
          <span className="text-caption text-fg-muted">{t("attendeesRequired")}</span>
        )}
      </fieldset>
      <Field label={t("topic")}>
        <Input
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value);
          }}
          placeholder={t("topicPlaceholder")}
          required
          maxLength={200}
        />
      </Field>
      <Field label={t("content")}>
        <Textarea
          rows={5}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
          }}
          placeholder={t("contentPlaceholder")}
          required
        />
      </Field>
      <Field label={t("agreedActions")}>
        <Textarea
          rows={2}
          value={agreedActions}
          onChange={(e) => {
            setAgreedActions(e.target.value);
          }}
          placeholder={t("agreedActionsPlaceholder")}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending} disabled={attendeeIdList.length === 0}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
