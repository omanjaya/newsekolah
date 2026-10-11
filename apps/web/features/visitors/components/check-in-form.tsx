"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Checkbox, Input, Select, Textarea, useToast } from "@newsekolah/ui";
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

const ID_TYPES: IdType[] = ["ktp", "sim", "kartu_pelajar", "kartu_pegawai", "other"];

/** Hosts are teachers or staff; students are never visited. */
const HOST_KINDS: ProfileKind[] = ["teacher", "staff"];

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

  const idTypeOptions = ID_TYPES.map((value) => ({
    value,
    label: t(`idTypes.${value || "none"}`),
  }));

  const canSubmit = fullName.trim() !== "" && hostUserId !== "" && (!idChecked || idType !== "");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
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
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("fullName")}</span>
        <Input
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value);
          }}
          placeholder={t("fullNamePlaceholder")}
          maxLength={160}
          autoFocus
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("organization")}</span>
        <Input
          value={organization}
          onChange={(e) => {
            setOrganization(e.target.value);
          }}
          placeholder={t("organizationPlaceholder")}
          maxLength={160}
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("host")}</span>
        <DirectoryPicker
          profileKind={HOST_KINDS}
          value={hostUserId}
          onValueChange={setHostUserId}
          labels={hostLabels}
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
          placeholder={t("purposePlaceholder")}
          maxLength={300}
        />
      </label>
      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        <label className="flex items-center gap-2 text-[13px] font-medium">
          <Checkbox
            checked={idChecked}
            onCheckedChange={(v) => {
              setIdChecked(v === true);
              if (v !== true) setIdType("");
            }}
          />
          {t("idChecked")}
        </label>
        <p className="text-[12px] text-fg-muted">{t("idCheckedHint")}</p>
        {idChecked && (
          <Select
            options={idTypeOptions.filter((o) => o.value !== "")}
            value={idType}
            onValueChange={(v) => {
              setIdType(v as IdType);
            }}
            placeholder={t("idTypePlaceholder")}
          />
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onDone();
          }}
        >
          {t("cancel")}
        </Button>
        <Button type="submit" loading={checkIn.isPending} disabled={!canSubmit}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
