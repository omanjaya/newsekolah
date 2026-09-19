"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, Textarea, useToast } from "@newsekolah/ui";
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
      <label className="flex flex-col gap-1 text-[13px]">
        <span>{t("memberType")}</span>
        <Select
          value={memberTypeId}
          onValueChange={setMemberTypeId}
          options={(types.data?.data ?? []).map((type) => ({ value: type.id, label: type.name }))}
          disabled={types.isLoading}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span>{t("validUntil")}</span>
        <Input
          type="date"
          value={validUntil}
          onChange={(event) => {
            setValidUntil(event.target.value);
          }}
        />
        <span className="text-fg-muted">{t("validUntilHint")}</span>
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span>{t("notes")}</span>
        <Textarea
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
          }}
          maxLength={1000}
        />
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={update.isPending} disabled={!memberTypeId || types.isError}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
