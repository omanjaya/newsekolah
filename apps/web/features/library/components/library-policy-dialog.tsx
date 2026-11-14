"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  Field,
  FormSection,
  Input,
  NumberInput,
  Select,
  SkeletonForm,
  Switch,
  useToast,
} from "@newsekolah/ui";
import { SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type LibraryPolicy,
  type LibraryPolicyWrite,
  useLibraryPolicyQuery,
  useUpdateLibraryPolicyMutation,
} from "../api";

const numericFields = [
  ["loan_days", 1],
  ["max_active_loans", 1],
  ["max_renewals", 0],
  ["renewal_days", 1],
  ["fine_per_day", 0],
  ["reservation_hold_days", 1],
  ["booking_max", 0],
  ["due_reminder_days", 0],
] as const;
const booleanFields = [
  "saturday_closed",
  "sunday_closed",
  "booking_enabled",
  "fine_currency_enabled",
  "block_loans_with_unpaid_fines",
  "auto_register_members",
] as const;
const textFields = [
  ["name", 150],
  ["npp", 60],
  ["accession_format", 60],
  ["member_no_format", 60],
] as const;

const POLICY_FORM_ID = "library-policy-form";

/** The library's general policy (loan length, limits, fines, numbering), edited in one dialog. */
export function LibraryPolicyDialog(): ReactElement {
  const t = useTranslations("app.library.policy");
  const [open, setOpen] = useState(false);
  const policy = useLibraryPolicyQuery();
  return (
    <>
      <Button
        variant="secondary"
        icon={<SlidersHorizontal />}
        onClick={() => {
          setOpen(true);
        }}
      >
        {t("title")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t("title")} description={t("description")} size="lg">
          {policy.isLoading && <SkeletonForm />}
          {policy.isError && <QueryError retry={() => policy.refetch()} error={policy.error} />}
          {open && policy.data && !policy.isError && (
            <PolicyForm
              initial={policy.data}
              onDone={() => {
                setOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PolicyForm({
  initial,
  onDone,
}: {
  initial: LibraryPolicy;
  onDone: () => void;
}): ReactElement {
  const t = useTranslations("app.library.policy");
  const apiErrorMessage = useApiErrorMessage();
  const toast = useToast();
  const update = useUpdateLibraryPolicyMutation();
  const [form, setForm] = useState<LibraryPolicyWrite>(initial);
  return (
    <form
      id={POLICY_FORM_ID}
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate(form, {
          onSuccess: () => {
            toast.success(t("saved"));
            onDone();
          },
          onError: (error) => {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          },
        });
      }}
    >
      <FormSection title={t("sections.identity")} description={t("numberingHint")}>
        {textFields.map(([field, maxLength]) => (
          <Field key={field} label={t(field)} required={field !== "npp"}>
            <Input
              value={form[field] ?? ""}
              maxLength={maxLength}
              onChange={(event) => {
                setForm({ ...form, [field]: event.target.value });
              }}
            />
          </Field>
        ))}
        <Field label={t("barcode_source")}>
          <Select
            value={form.barcode_source ?? "no_induk"}
            options={[
              { value: "no_induk", label: t("barcodeAccession") },
              { value: "item_id", label: t("barcodeItem") },
            ]}
            onValueChange={(value) => {
              setForm({ ...form, barcode_source: value as "no_induk" | "item_id" });
            }}
          />
        </Field>
      </FormSection>
      <FormSection title={t("sections.limits")}>
        {numericFields.map(([field, min]) => (
          <Field key={field} label={t(field)} required>
            <NumberInput
              min={min}
              step={1}
              value={form[field] ?? 0}
              onChange={(value) => {
                setForm({ ...form, [field]: value ?? min });
              }}
            />
          </Field>
        ))}
      </FormSection>
      <FormSection title={t("sections.rules")}>
        {booleanFields.map((field) => (
          <Field key={field} label={t(field)} orientation="horizontal" className="col-span-full">
            <Switch
              checked={form[field] ?? false}
              onCheckedChange={(checked) => {
                setForm({ ...form, [field]: checked });
              }}
            />
          </Field>
        ))}
      </FormSection>
      <DialogFooter>
        <Button variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={update.isPending}>
          {t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
