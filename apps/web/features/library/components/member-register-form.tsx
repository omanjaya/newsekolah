"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  DialogFooter,
  FormError,
  Field,
  Button,
  Input,
  Select,
  useSubmitValidation,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  DirectoryPicker,
  useDirectoryPickerLabels,
} from "../../reference/components/directory-picker";
import { useRegisterLibraryMemberMutation } from "../members-api";
import { MEMBER_ROLES, type MemberRole, useMemberTypeChoice } from "../use-member-type-choice";

/** Registers one existing user (picked by role, then by name) as a library member. */
export function MemberRegisterForm({
  onDone,
}: {
  onDone: (registered: boolean) => void;
}): ReactElement {
  const t = useTranslations("app.library.members.registerForm");
  const tRole = useTranslations("app.library.members.roles");
  const tValidation = useTranslations("validation");
  const apiErrorMessage = useApiErrorMessage();
  const register = useRegisterLibraryMemberMutation();

  const [role, setRole] = useState<MemberRole>("student");
  const [userId, setUserId] = useState("");
  const memberType = useMemberTypeChoice(role);
  const memberTypeId = memberType.value;
  const [memberNo, setMemberNo] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  // A conflict the librarian fixes in one field is shown on that field,
  // not as a form-level message.
  const [userError, setUserError] = useState("");
  const [memberNoError, setMemberNoError] = useState("");
  const { ref, attempted, check } = useSubmitValidation();
  const required = (value: string) => (attempted && !value ? tValidation("required") : undefined);

  const userLabels = useDirectoryPickerLabels(t("userPlaceholder"));

  return (
    <form
      ref={ref}
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        setUserError("");
        setMemberNoError("");
        if (!check(Boolean(userId && memberTypeId))) return;
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
              const code = err instanceof ApiError ? err.code : "UNKNOWN";
              const message = apiErrorMessage(code);
              if (code === "LIBRARY_MEMBER_ALREADY_EXISTS") setUserError(message);
              else if (code === "LIBRARY_MEMBER_NO_COLLISION") setMemberNoError(message);
              else setError(message);
            },
          },
        );
      }}
    >
      <Field label={t("role")}>
        <Select
          options={MEMBER_ROLES.map((r) => ({ value: r, label: tRole(r) }))}
          value={role}
          onValueChange={(value) => {
            setRole(value as MemberRole);
            setUserId("");
          }}
        />
      </Field>
      <Field label={t("user")} required error={required(userId) ?? (userError || undefined)}>
        <DirectoryPicker
          key={role}
          profileKind={role}
          value={userId}
          onValueChange={(id) => {
            setUserId(id);
            setUserError("");
          }}
          labels={userLabels}
          showUsername
        />
      </Field>
      <Field label={t("memberType")} required error={required(memberTypeId)}>
        <Select
          options={memberType.options}
          value={memberTypeId}
          onValueChange={memberType.onValueChange}
          placeholder={t("memberTypePlaceholder")}
          disabled={memberType.isLoading}
        />
      </Field>
      <Field label={t("memberNo")} optional error={memberNoError || undefined}>
        <Input
          value={memberNo}
          onChange={(e) => {
            setMemberNo(e.target.value);
            setMemberNoError("");
          }}
          placeholder={t("memberNoPlaceholder")}
          maxLength={40}
        />
      </Field>
      <Field label={t("notes")} optional>
        <Input
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
          maxLength={500}
        />
      </Field>
      {error && <FormError>{error}</FormError>}
      <DialogFooter>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onDone(false);
          }}
        >
          {t("cancel")}
        </Button>
        <Button type="submit" loading={register.isPending}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
