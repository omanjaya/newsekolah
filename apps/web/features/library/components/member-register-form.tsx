"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useDirectoryQuery } from "../../reference/api";
import { useLibraryMemberTypesQuery, useRegisterLibraryMemberMutation } from "../members-api";

const ROLES = ["student", "teacher", "staff", "parent"] as const;
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

  const directory = useDirectoryQuery(role);
  const userOptions = (directory.data?.data ?? []).map((u) => ({
    value: u.id,
    label: `${u.name} (${u.username})`,
  }));
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
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("role")}</span>
        <Select
          options={ROLES.map((r) => ({ value: r, label: tRole(r) }))}
          value={role}
          onValueChange={(value) => {
            setRole(value as Role);
            setUserId("");
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("user")}</span>
        <Select
          options={userOptions}
          value={userId}
          onValueChange={setUserId}
          placeholder={directory.isLoading ? t("loadingUsers") : t("userPlaceholder")}
          disabled={directory.isLoading || userOptions.length === 0}
        />
        {!directory.isLoading && userOptions.length === 0 && (
          <span className="text-fg-muted">{t("noUsers")}</span>
        )}
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("memberType")}</span>
        <Select
          options={typeOptions}
          value={memberTypeId}
          onValueChange={setMemberTypeId}
          placeholder={t("memberTypePlaceholder")}
          disabled={memberTypes.isLoading}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("memberNo")}</span>
        <Input
          value={memberNo}
          onChange={(e) => {
            setMemberNo(e.target.value);
          }}
          placeholder={t("memberNoPlaceholder")}
          maxLength={40}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("notes")}</span>
        <Input
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
          maxLength={500}
        />
      </label>
      {error && <p className="text-[13px] text-status-absent">{error}</p>}
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
