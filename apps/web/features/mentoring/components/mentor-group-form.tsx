"use client";

import { ApiError } from "@newsekolah/api-client";
import { DialogFooter, Field, Button, Input, useSubmitValidation, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  DirectoryPicker,
  useDirectoryPickerLabels,
} from "../../reference/components/directory-picker";
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
  const mentorLabels = useDirectoryPickerLabels(t("mentorPlaceholder"));
  const create = useCreateMentorGroupMutation();
  const update = useUpdateMentorGroupMutation();

  const [mentorUserId, setMentorUserId] = useState(initial?.mentor_user_id ?? "");
  const [name, setName] = useState(initial?.name ?? "");

  const pending = create.isPending || update.isPending;
  const { ref: formRef, attempted, check } = useSubmitValidation();
  const tValidation = useTranslations("validation");
  const requiredError = (value: string) =>
    attempted && !value.trim() ? tValidation("required") : undefined;

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!check(Boolean(mentorUserId && name.trim()))) return;
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
      <Field label={t("mentor")} required error={requiredError(mentorUserId)}>
        <DirectoryPicker
          profileKind="teacher"
          value={mentorUserId}
          onValueChange={setMentorUserId}
          labels={mentorLabels}
        />
      </Field>
      <Field label={t("name")} required error={requiredError(name)}>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder={t("namePlaceholder")}
          maxLength={100}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
