"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  DialogFooter,
  NumberInput,
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
  type LibraryMemberType,
  type LibraryMemberTypeWrite,
  useCreateLibraryMemberTypeMutation,
  useUpdateLibraryMemberTypeMutation,
} from "../members-api";

const FINE_TYPES: LibraryMemberTypeWrite["fine_type"][] = ["constant", "per_tenor"];
const ROLES = ["", "student", "teacher", "staff"] as const;

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
  // A taken name or a role that already has a default is said on the
  // field to change, with the dialog kept open.
  const [nameError, setNameError] = useState("");
  const [roleError, setRoleError] = useState("");
  const { ref: formRef, attempted, check } = useSubmitValidation();
  const tValidation = useTranslations("validation");
  const requiredError = (value: string) =>
    attempted && !value.trim() ? tValidation("required") : undefined;

  const mutation = memberType ? update : create;

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        setNameError("");
        setRoleError("");
        if (!check(Boolean(name.trim()))) return;
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
          const code = err instanceof ApiError ? err.code : "UNKNOWN";
          const message = apiErrorMessage(code);
          if (code === "LIBRARY_MEMBER_TYPE_NAME_EXISTS") setNameError(message);
          else if (code === "LIBRARY_MEMBER_TYPE_DEFAULT_ROLE_TAKEN") setRoleError(message);
          else setError(message);
        };
        if (memberType) {
          update.mutate({ memberTypeId: memberType.id, ...body }, { onSuccess: onDone, onError });
        } else {
          create.mutate(body, { onSuccess: onDone, onError });
        }
      }}
    >
      <Field label={t("name")} required error={requiredError(name) ?? (nameError || undefined)}>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameError("");
          }}
          maxLength={100}
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={t("maxLoanItems")}>
          <NumberInput
            min={1}
            value={maxLoanItems === "" ? null : Number(maxLoanItems)}
            onChange={(next) => {
              setMaxLoanItems(next === null ? "" : String(next));
            }}
          />
        </Field>
        <Field label={t("maxLoanDays")}>
          <NumberInput
            min={1}
            value={maxLoanDays === "" ? null : Number(maxLoanDays)}
            onChange={(next) => {
              setMaxLoanDays(next === null ? "" : String(next));
            }}
          />
        </Field>
        <Field label={t("renewalDays")}>
          <NumberInput
            min={1}
            value={renewalDays === "" ? null : Number(renewalDays)}
            onChange={(next) => {
              setRenewalDays(next === null ? "" : String(next));
            }}
          />
        </Field>
        <Field label={t("maxRenewals")}>
          <NumberInput
            min={0}
            value={maxRenewals === "" ? null : Number(maxRenewals)}
            onChange={(next) => {
              setMaxRenewals(next === null ? "" : String(next));
            }}
          />
        </Field>
        <Field label={t("fineType")} hint={t(`fineTypeHint.${fineType}`)}>
          <Select
            options={FINE_TYPES.map((v) => ({ value: v, label: t(`fineTypeOptions.${v}`) }))}
            value={fineType}
            onValueChange={(v) => {
              setFineType(v as LibraryMemberTypeWrite["fine_type"]);
            }}
          />
        </Field>
        <Field label={t("finePerTenor")}>
          <NumberInput
            min={0}
            value={finePerTenor === "" ? null : Number(finePerTenor)}
            onChange={(next) => {
              setFinePerTenor(next === null ? "" : String(next));
            }}
          />
        </Field>
        {/* A flat fine is charged once, so its period length means nothing. */}
        {fineType === "per_tenor" && (
          <Field label={t("tenorDays")}>
            <NumberInput
              min={1}
              value={tenorDays === "" ? null : Number(tenorDays)}
              onChange={(next) => {
                setTenorDays(next === null ? "" : String(next));
              }}
            />
          </Field>
        )}
        <Field label={t("suspendDays")}>
          <NumberInput
            min={0}
            value={suspendDays === "" ? null : Number(suspendDays)}
            onChange={(next) => {
              setSuspendDays(next === null ? "" : String(next));
            }}
          />
        </Field>
        <Field label={t("validityMonths")}>
          <NumberInput
            min={1}
            value={validityMonths === "" ? null : Number(validityMonths)}
            onChange={(next) => {
              setValidityMonths(next === null ? "" : String(next));
            }}
          />
        </Field>
        <Field label={t("defaultForRole")} error={roleError || undefined}>
          <Select
            options={ROLES.filter((r) => r !== "").map((r) => ({ value: r, label: tRole(r) }))}
            value={defaultForRole}
            onValueChange={(value) => {
              setDefaultForRole(value);
              setRoleError("");
            }}
            placeholder={t("defaultForRoleNone")}
          />
        </Field>
      </div>
      {error && <FormError>{error}</FormError>}
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          {t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
