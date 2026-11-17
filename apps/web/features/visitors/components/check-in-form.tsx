"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Checkbox,
  DialogFooter,
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
import type { ProfileKind } from "../../reference/api";
import {
  DirectoryPicker,
  useDirectoryPickerLabels,
} from "../../reference/components/directory-picker";
import { type CheckInInput, type Visit, useCheckInVisitMutation } from "../api";

type IdType = CheckInInput["id_type"];

const ID_TYPES: Exclude<IdType, "">[] = ["ktp", "sim", "kartu_pelajar", "kartu_pegawai", "other"];

/** Hosts are teachers or staff; students are never visited. */
const HOST_KINDS: ProfileKind[] = ["teacher", "staff"];

/**
 * Signs a visitor in at the gate: who, from where, whom they came to see,
 * why, and whether an ID was looked at (only its kind is kept). Save stays
 * available; a submit with a gap names the field instead of doing nothing.
 */
export function CheckInForm({
  expectedGuestId,
  defaultFullName,
  defaultOrganization,
  defaultHostUserId,
  defaultPurpose,
  onDone,
}: {
  expectedGuestId?: string;
  defaultFullName?: string;
  defaultOrganization?: string;
  defaultHostUserId?: string;
  defaultPurpose?: string;
  onDone: (visit?: Visit) => void;
}): ReactElement {
  const t = useTranslations("app.visitors.checkIn");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const hostLabels = useDirectoryPickerLabels(t("hostPlaceholder"));
  const checkIn = useCheckInVisitMutation();

  const [fullName, setFullName] = useState(defaultFullName ?? "");
  const [organization, setOrganization] = useState(defaultOrganization ?? "");
  const [hostUserId, setHostUserId] = useState(defaultHostUserId ?? "");
  const [purpose, setPurpose] = useState(defaultPurpose ?? "");
  const [idChecked, setIdChecked] = useState(false);
  const [idType, setIdType] = useState<IdType>("");
  const [attempted, setAttempted] = useState(false);

  const errors = {
    fullName: fullName.trim() === "" ? t("errors.fullName") : undefined,
    host: hostUserId === "" ? t("errors.host") : undefined,
    idType: idChecked && idType === "" ? t("errors.idType") : undefined,
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
        if (!valid || checkIn.isPending) return;
        checkIn.mutate(
          {
            expected_guest_id: expectedGuestId,
            full_name: fullName.trim(),
            organization: organization.trim() || undefined,
            host_user_id: hostUserId,
            purpose: purpose.trim() || undefined,
            id_checked: idChecked,
            id_type: idChecked ? idType : "",
          },
          {
            onSuccess: (visit) => {
              toast.success(t("signedIn"));
              onDone(visit);
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
      <Field label={t("fullName")} required error={shown(errors.fullName)}>
        <Input
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value);
          }}
          placeholder={t("fullNamePlaceholder")}
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
      <div className="flex flex-col gap-4">
        <Checkbox
          checked={idChecked}
          label={t("idChecked")}
          description={t("idCheckedHint")}
          onCheckedChange={(v) => {
            setIdChecked(v === true);
            if (v !== true) setIdType("");
          }}
        />
        {idChecked && (
          <Field label={t("idType")} required error={shown(errors.idType)}>
            <Select
              options={ID_TYPES.map((value) => ({ value, label: t(`idTypes.${value}`) }))}
              value={idType}
              onValueChange={(v) => {
                setIdType(v as IdType);
              }}
              placeholder={t("idTypePlaceholder")}
            />
          </Field>
        )}
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onDone();
          }}
        >
          {t("cancel")}
        </Button>
        <Button type="submit" loading={checkIn.isPending}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
