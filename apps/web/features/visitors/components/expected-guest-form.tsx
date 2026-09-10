"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select, Textarea, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useDirectoryQuery } from "../../reference/api";
import { useCreateExpectedGuestMutation } from "../api";

export function ExpectedGuestForm({
  defaultDate,
  onDone,
}: {
  defaultDate: string;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.visitors.expected.form");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const teachers = useDirectoryQuery("teacher");
  const staff = useDirectoryQuery("staff");
  const create = useCreateExpectedGuestMutation();

  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");
  const [hostUserId, setHostUserId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [expectedDate, setExpectedDate] = useState(defaultDate);
  const [notes, setNotes] = useState("");

  const hostOptions = useMemo(
    () =>
      [...(teachers.data?.data ?? []), ...(staff.data?.data ?? [])].map((u) => ({
        value: u.id,
        label: u.name,
      })),
    [teachers.data, staff.data],
  );

  const canSubmit = fullName.trim() !== "" && hostUserId !== "" && expectedDate !== "";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        create.mutate(
          {
            full_name: fullName.trim(),
            organization: organization.trim() || undefined,
            host_user_id: hostUserId,
            purpose: purpose.trim() || undefined,
            expected_date: expectedDate,
            notes: notes.trim() || undefined,
          },
          {
            onSuccess: () => {
              toast.success(t("added"));
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
        <span className="font-medium">{t("fullName")}</span>
        <Input
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value);
          }}
          maxLength={160}
          required
          autoFocus
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("organization")}</span>
        <Input
          value={organization}
          onChange={(e) => {
            setOrganization(e.target.value);
          }}
          maxLength={160}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("host")}</span>
        <Select
          options={hostOptions}
          value={hostUserId}
          onValueChange={setHostUserId}
          placeholder={t("hostPlaceholder")}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("date")}</span>
        <Input
          type="date"
          value={expectedDate}
          onChange={(e) => {
            setExpectedDate(e.target.value);
          }}
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("purpose")}</span>
        <Textarea
          rows={2}
          value={purpose}
          onChange={(e) => {
            setPurpose(e.target.value);
          }}
          maxLength={300}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("notes")}</span>
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
          maxLength={500}
        />
      </label>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={create.isPending} disabled={!canSubmit}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
