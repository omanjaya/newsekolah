"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Select, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useClassesQuery } from "../../reference/api";
import type { LibraryTitle } from "../api";
import { type LibraryBatchBorrowResult, useCommitClassReturnsMutation } from "../class-loans-api";

import { ClassTitlePicker } from "./class-title-picker";

/** Hands back every roster student's active loan of one title in a single pass. */
export function ClassLoanReturnPanel(): ReactElement {
  const t = useTranslations("app.library.classLoans.returns");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const classes = useClassesQuery();
  const [classId, setClassId] = useState("");
  const [title, setTitle] = useState<LibraryTitle | null>(null);
  const [result, setResult] = useState<LibraryBatchBorrowResult | null>(null);

  const commitReturns = useCommitClassReturnsMutation();
  const classOptions = (classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  function submit() {
    if (!classId || !title) return;
    commitReturns.mutate(
      { class_id: classId, title_id: title.id },
      {
        onSuccess: (data) => {
          setResult(data);
          toast.success(t("success", { count: data.loans.length }));
        },
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-sm border border-border bg-surface p-4">
      <h2 className="text-[15px] font-semibold text-fg">{t("heading")}</h2>
      <p className="text-[13px] text-fg-muted">{t("description")}</p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("classLabel")}</span>
          <Select
            options={classOptions}
            value={classId}
            onValueChange={(value) => {
              setClassId(value);
              setResult(null);
            }}
            placeholder={classes.isLoading ? t("loadingClasses") : t("classPlaceholder")}
            disabled={classes.isLoading}
            className="w-56"
          />
        </label>
        <div className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-fg">{t("titleLabel")}</span>
          <ClassTitlePicker
            selected={title}
            onSelect={(next) => {
              setTitle(next);
              setResult(null);
            }}
            onClear={() => {
              setTitle(null);
              setResult(null);
            }}
          />
        </div>
        <Button
          type="button"
          loading={commitReturns.isPending}
          disabled={!classId || !title}
          onClick={submit}
        >
          {t("submit")}
        </Button>
      </div>

      {result && result.rejected.length > 0 && (
        <div className="flex flex-col gap-1 rounded-xs border border-status-absent/40 bg-status-absent/5 p-3">
          <span className="text-[13px] font-medium text-status-absent">{t("rejectedTitle")}</span>
          <ul className="flex flex-col gap-1">
            {result.rejected.map((item) => (
              <li key={item.barcode} className="text-[13px] text-fg">
                {item.barcode}: {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
