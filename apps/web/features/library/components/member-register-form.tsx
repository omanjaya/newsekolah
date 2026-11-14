"use client";

import { ApiError } from "@newsekolah/api-client";
import { FormError, Field, Button, Input, Select } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  DirectoryPicker,
  useDirectoryPickerLabels,
} from "../../reference/components/directory-picker";
import { useLibraryMemberTypesQuery, useRegisterLibraryMemberMutation } from "../members-api";

const ROLES = ["student", "teacher", "staff"] as const;
type Role = (typeof ROLES)[number];

/** Registers one existing user (picked by role, then by name) as a library member. */
export function MemberRegisterForm({
  onDone,
}: {
  onDone: (registered: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.library.members.registerForm");
  const tRole = useTranslations("app.library.members.roles");
  const apiErrorMessage = useApiErrorMessage();
  const memberTypes = useLibraryMemberTypesQuery();
  const register = useRegisterLibraryMemberMutation();

  const [role, setRole] = useState<Role>("student");
  const [userId, setUserId] = useState("");
  const [memberTypeId, setMemberTypeId] = useState("");
  const [memberNo, setMemberNo] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const userLabels = useDirectoryPickerLabels(t("userPlaceholder"));
  const typeOptions = (memberTypes.data?.data ?? []).map((mt) => ({
    value: mt.id,
    label: mt.name,
  }));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        if (!userId || !memberTypeId) return;
        register.mutate(
          {
            user_id: userId,
            member_type_id: memberTypeId,
            member_no: memberNo.trim() || undefined,
            notes: notes.trim() || undefined,
          },
          {
            onSuccess: () => {
              onDone(true);
            },
            onError: (err) => {
              setError(
                err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"),
              );
            },
          },
        );
      }}
    >
      <Field label={t("role")}>
        <Select
          options={ROLES.map((r) => ({ value: r, label: tRole(r) }))}
          value={role}
          onValueChange={(value) => {
            setRole(value as Role);
            setUserId("");
          }}
        />
      </Field>
      <Field label={t("user")}>
        <DirectoryPicker
          key={role}
          profileKind={role}
          value={userId}
          onValueChange={setUserId}
          labels={userLabels}
          showUsername
        />
      </Field>
      <Field label={t("memberType")}>
        <Select
          options={typeOptions}
          value={memberTypeId}
          onValueChange={setMemberTypeId}
          placeholder={t("memberTypePlaceholder")}
          disabled={memberTypes.isLoading}
        />
      </Field>
      <Field label={t("memberNo")}>
        <Input
          value={memberNo}
          onChange={(e) => {
            setMemberNo(e.target.value);
          }}
          placeholder={t("memberNoPlaceholder")}
          maxLength={40}
        />
      </Field>
      <Field label={t("notes")}>
        <Input
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
          maxLength={500}
        />
      </Field>
      {error && <FormError>{error}</FormError>}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onDone(false);
          }}
        >
          {t("cancel")}
        </Button>
        <Button type="submit" loading={register.isPending} disabled={!userId || !memberTypeId}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
