"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Field,
  Button,
  Select,
  useToast,
  Alert,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useClassesQuery } from "../../reference/api";
import type { LibraryTitle } from "../api";
import { type LibraryBatchBorrowResult, useCommitClassReturnsMutation } from "../class-loans-api";

import { ClassTitlePicker } from "./class-title-picker";
import { RejectedReasonList } from "./rejected-reason-list";

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
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("heading")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>

      <div className="grid grid-cols-1 items-end gap-4 px-5 pb-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
        <Field label={t("classLabel")}>
          <Select
            options={classOptions}
            value={classId}
            onValueChange={(value) => {
              setClassId(value);
              setResult(null);
            }}
            placeholder={classes.isLoading ? t("loadingClasses") : t("classPlaceholder")}
            disabled={classes.isLoading}
          />
        </Field>
        <Field label={t("titleLabel")}>
          {(control) => (
            <ClassTitlePicker
              id={control.id}
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
          )}
        </Field>
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
        <Alert tone="danger" title={t("rejectedTitle")} className="mx-5 mb-5">
          <RejectedReasonList
            items={result.rejected.map((item) => ({
              key: item.barcode,
              label: item.barcode,
              code: item.code,
              reason: item.reason,
            }))}
          />
        </Alert>
      )}
    </Card>
  );
}
