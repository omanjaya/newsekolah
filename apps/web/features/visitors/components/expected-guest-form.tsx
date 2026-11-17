"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  DatePicker,
  DialogFooter,
  Field,
  FormSection,
  Input,
  Textarea,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import type { ProfileKind } from "../../reference/api";
import {
  DirectoryPicker,
  useDirectoryPickerLabels,
} from "../../reference/components/directory-picker";
import { useCreateExpectedGuestMutation } from "../api";

/** Hosts are teachers or staff; students are never visited. */
const HOST_KINDS: ProfileKind[] = ["teacher", "staff"];

/** Puts a visitor on the gate's list ahead of time, so the guard finds them by name. */
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
  const hostLabels = useDirectoryPickerLabels(t("hostPlaceholder"));
  const create = useCreateExpectedGuestMutation();

  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");
  const [hostUserId, setHostUserId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [expectedDate, setExpectedDate] = useState(defaultDate);
  const [notes, setNotes] = useState("");
  const [attempted, setAttempted] = useState(false);

  const errors = {
    fullName: fullName.trim() === "" ? t("errors.fullName") : undefined,
    host: hostUserId === "" ? t("errors.host") : undefined,
    date: expectedDate === "" ? t("errors.date") : undefined,
  };
  const valid = Object.values(errors).every((error) => error === undefined);
  const shown = (error: string | undefined) => (attempted ? error : undefined);

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setAttempted(true);
        if (!valid || create.isPending) return;
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
      <FormSection columns={1}>
        <Field label={t("fullName")} required error={shown(errors.fullName)}>
          <Input
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
            }}
            maxLength={160}
            autoComplete="off"
          />
        </Field>
        <Field label={t("organization")} optional>
          <Input
            value={organization}
            onChange={(e) => {
              setOrganization(e.target.value);
            }}
            maxLength={160}
            autoComplete="off"
          />
        </Field>
        <Field label={t("host")} required error={shown(errors.host)}>
          <DirectoryPicker
            profileKind={HOST_KINDS}
            value={hostUserId}
            onValueChange={setHostUserId}
            labels={hostLabels}
          />
        </Field>
        <Field label={t("date")} required error={shown(errors.date)}>
          <DatePicker value={expectedDate} onChange={setExpectedDate} required />
        </Field>
        <Field label={t("purpose")} optional>
          <Textarea
            rows={2}
            value={purpose}
            onChange={(e) => {
              setPurpose(e.target.value);
            }}
            maxLength={300}
          />
        </Field>
        <Field label={t("notes")} optional>
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
            }}
            maxLength={500}
          />
        </Field>
      </FormSection>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={create.isPending}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
