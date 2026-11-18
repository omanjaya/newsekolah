"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  DatePicker,
  DialogFooter,
  Field,
  Select,
  Textarea,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type LibraryMember,
  useLibraryMemberTypesQuery,
  useUpdateLibraryMemberMutation,
} from "../members-api";

export function MemberProfileForm({
  member,
  onDone,
}: {
  member: LibraryMember;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.library.memberProfile");
  const apiErrorMessage = useApiErrorMessage();
  const toast = useToast();
  const types = useLibraryMemberTypesQuery();
  const update = useUpdateLibraryMemberMutation();
  const [memberTypeId, setMemberTypeId] = useState(member.member_type_id);
  const [validUntil, setValidUntil] = useState(member.valid_until ?? "");
  const [notes, setNotes] = useState(member.notes ?? "");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate(
          {
            userId: member.user_id,
            member_type_id: memberTypeId,
            valid_until: validUntil || undefined,
            notes: notes.trim(),
          },
          {
            onSuccess: () => {
              toast.success(t("saved"));
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
      <Field label={t("memberType")}>
        <Select
          value={memberTypeId}
          onValueChange={setMemberTypeId}
          options={(types.data?.data ?? []).map((type) => ({ value: type.id, label: type.name }))}
          disabled={types.isLoading}
        />
      </Field>
      <Field label={t("validUntil")} hint={t("validUntilHint")}>
        <DatePicker value={validUntil} onChange={setValidUntil} clearable />
      </Field>
      <Field label={t("notes")}>
        <Textarea
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
          }}
          maxLength={1000}
        />
      </Field>
      <DialogFooter>
        <Button variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={update.isPending} disabled={!memberTypeId || types.isError}>
          {t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
