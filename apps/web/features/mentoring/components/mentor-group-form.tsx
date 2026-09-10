"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useTeachersQuery } from "../../reference/api";
import {
  type MentorGroup,
  useCreateMentorGroupMutation,
  useUpdateMentorGroupMutation,
} from "../api";

export function MentorGroupForm({
  initial,
  onDone,
}: {
  initial?: MentorGroup;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.mentoring.groups.form");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const teachers = useTeachersQuery();
  const create = useCreateMentorGroupMutation();
  const update = useUpdateMentorGroupMutation();

  const [mentorUserId, setMentorUserId] = useState(initial?.mentor_user_id ?? "");
  const [name, setName] = useState(initial?.name ?? "");

  const teacherOptions = (teachers.data?.data ?? []).map((u) => ({ value: u.id, label: u.name }));
  const pending = create.isPending || update.isPending;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!mentorUserId || !name.trim()) return;
        const body = { mentor_user_id: mentorUserId, name: name.trim() };
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
          update.mutate({ groupId: initial.id, ...body }, { onSuccess, onError });
        } else {
          create.mutate(body, { onSuccess, onError });
        }
      }}
    >
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("mentor")}</span>
        <Select
          options={teacherOptions}
          value={mentorUserId}
          onValueChange={setMentorUserId}
          placeholder={t("mentorPlaceholder")}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("name")}</span>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder={t("namePlaceholder")}
          required
          maxLength={100}
        />
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending} disabled={!mentorUserId || !name.trim()}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
