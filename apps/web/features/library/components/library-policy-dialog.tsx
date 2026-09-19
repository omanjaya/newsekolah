"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Dialog, DialogContent, Input, Select, Switch, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

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

export function LibraryPolicyDialog(): ReactElement {
  const t = useTranslations("app.library.policy");
  const [open, setOpen] = useState(false);
  const policy = useLibraryPolicyQuery();
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t("title")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t("title")} description={t("description")}>
          {policy.isLoading && <p aria-busy="true">{t("loading")}</p>}
          {policy.isError && (
            <div role="alert" className="flex flex-col gap-2">
              <p>{t("loadError")}</p>
              <Button
                variant="secondary"
                onClick={() => {
                  void policy.refetch();
                }}
              >
                {t("retry")}
              </Button>
            </div>
          )}
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
      className="flex flex-col gap-4"
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {textFields.map(([field, maxLength]) => (
          <label key={field} className="flex flex-col gap-1 text-[13px]">
            <span>{t(field)}</span>
            <Input
              value={form[field] ?? ""}
              maxLength={maxLength}
              required={field !== "npp"}
              onChange={(event) => {
                setForm({ ...form, [field]: event.target.value });
              }}
            />
          </label>
        ))}
        <label className="flex flex-col gap-1 text-[13px]">
          <span>{t("barcode_source")}</span>
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
        </label>
        {numericFields.map(([field, min]) => (
          <label key={field} className="flex flex-col gap-1 text-[13px]">
            <span>{t(field)}</span>
            <Input
              type="number"
              min={min}
              step={1}
              required
              value={form[field] ?? 0}
              onChange={(event) => {
                setForm({ ...form, [field]: Number(event.target.value) });
              }}
            />
          </label>
        ))}
      </div>
      <p className="text-[12px] text-fg-muted">{t("numberingHint")}</p>
      {booleanFields.map((field) => (
        <label key={field} className="flex items-center gap-2 text-[13px]">
          <Switch
            checked={form[field] ?? false}
            onCheckedChange={(checked) => {
              setForm({ ...form, [field]: checked });
            }}
          />
          <span>{t(field)}</span>
        </label>
      ))}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" loading={update.isPending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
