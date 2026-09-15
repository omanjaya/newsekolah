"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Select } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type LibraryMemberType,
  type LibraryMemberTypeWrite,
  useCreateLibraryMemberTypeMutation,
  useUpdateLibraryMemberTypeMutation,
} from "../members-api";

const FINE_TYPES: LibraryMemberTypeWrite["fine_type"][] = ["constant", "per_tenor"];
const ROLES = ["", "student", "teacher", "staff", "parent"] as const;

function numberField(value: string, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && value !== "" ? n : fallback;
}

/** Create or edit a member type: loan limits, renewal, fine rule, suspension, and validity. */
export function MemberTypeForm({
  memberType,
  onDone,
}: {
  memberType: LibraryMemberType | null;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.library.memberTypes.form");
  const tRole = useTranslations("app.library.members.roles");
  const apiErrorMessage = useApiErrorMessage();
  const create = useCreateLibraryMemberTypeMutation();
  const update = useUpdateLibraryMemberTypeMutation();

  const [name, setName] = useState(memberType?.name ?? "");
  const [maxLoanItems, setMaxLoanItems] = useState(String(memberType?.max_loan_items ?? 3));
  const [maxLoanDays, setMaxLoanDays] = useState(String(memberType?.max_loan_days ?? 7));
  const [renewalDays, setRenewalDays] = useState(String(memberType?.renewal_days ?? 7));
  const [maxRenewals, setMaxRenewals] = useState(String(memberType?.max_renewals ?? 1));
  const [fineType, setFineType] = useState<LibraryMemberTypeWrite["fine_type"]>(
    memberType?.fine_type ?? "constant",
  );
  const [finePerTenor, setFinePerTenor] = useState(String(memberType?.fine_per_tenor ?? 0));
  const [tenorDays, setTenorDays] = useState(String(memberType?.tenor_days ?? 1));
  const [suspendDays, setSuspendDays] = useState(String(memberType?.suspend_days ?? 0));
  const [validityMonths, setValidityMonths] = useState(String(memberType?.validity_months ?? 12));
  const [defaultForRole, setDefaultForRole] = useState(memberType?.default_for_role ?? "");
  const [error, setError] = useState("");

  const mutation = memberType ? update : create;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        const body: LibraryMemberTypeWrite = {
          name: name.trim(),
          max_loan_items: numberField(maxLoanItems, 1),
          max_loan_days: numberField(maxLoanDays, 1),
          renewal_days: numberField(renewalDays, 1),
          max_renewals: numberField(maxRenewals, 0),
          fine_type: fineType,
          fine_per_tenor: numberField(finePerTenor, 0),
          tenor_days: numberField(tenorDays, 1),
          suspend_days: numberField(suspendDays, 0),
          validity_months: numberField(validityMonths, 1),
          default_for_role: (defaultForRole ||
            undefined) as LibraryMemberTypeWrite["default_for_role"],
        };
        const onError = (err: unknown) => {
          setError(
            err instanceof ApiError ? apiErrorMessage(err.code) : apiErrorMessage("UNKNOWN"),
          );
        };
        if (memberType) {
          update.mutate({ memberTypeId: memberType.id, ...body }, { onSuccess: onDone, onError });
        } else {
          create.mutate(body, { onSuccess: onDone, onError });
        }
      }}
    >
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("name")}</span>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          required
          maxLength={100}
        />
      </label>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("maxLoanItems")}</span>
          <Input
            type="number"
            min={1}
            value={maxLoanItems}
            onChange={(e) => {
              setMaxLoanItems(e.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("maxLoanDays")}</span>
          <Input
            type="number"
            min={1}
            value={maxLoanDays}
            onChange={(e) => {
              setMaxLoanDays(e.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("renewalDays")}</span>
          <Input
            type="number"
            min={1}
            value={renewalDays}
            onChange={(e) => {
              setRenewalDays(e.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("maxRenewals")}</span>
          <Input
            type="number"
            min={0}
            value={maxRenewals}
            onChange={(e) => {
              setMaxRenewals(e.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("fineType")}</span>
          <Select
            options={FINE_TYPES.map((v) => ({ value: v, label: t(`fineTypeOptions.${v}`) }))}
            value={fineType}
            onValueChange={(v) => {
              setFineType(v as LibraryMemberTypeWrite["fine_type"]);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("finePerTenor")}</span>
          <Input
            type="number"
            min={0}
            value={finePerTenor}
            onChange={(e) => {
              setFinePerTenor(e.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("tenorDays")}</span>
          <Input
            type="number"
            min={1}
            value={tenorDays}
            onChange={(e) => {
              setTenorDays(e.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("suspendDays")}</span>
          <Input
            type="number"
            min={0}
            value={suspendDays}
            onChange={(e) => {
              setSuspendDays(e.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("validityMonths")}</span>
          <Input
            type="number"
            min={1}
            value={validityMonths}
            onChange={(e) => {
              setValidityMonths(e.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("defaultForRole")}</span>
          <Select
            options={ROLES.filter((r) => r !== "").map((r) => ({ value: r, label: tRole(r) }))}
            value={defaultForRole}
            onValueChange={setDefaultForRole}
            placeholder={t("defaultForRoleNone")}
          />
        </label>
      </div>
      {error && <p className="text-[13px] text-status-absent">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={mutation.isPending} disabled={!name.trim()}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
