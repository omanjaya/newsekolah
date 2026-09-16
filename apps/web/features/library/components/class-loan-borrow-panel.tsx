"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, EmptyState, Select, domainIcons, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useClassesQuery } from "../../reference/api";
import type { LibraryTitle } from "../api";
import {
  type LibraryClassLoanPreview,
  useCommitClassLoansMutation,
  usePreviewClassLoansMutation,
} from "../class-loans-api";

import { ClassTitlePicker } from "./class-title-picker";

/** Picks a class and a title, previews the roster/copy pairing, then commits it as loans. */
export function ClassLoanBorrowPanel(): ReactElement {
  const t = useTranslations("app.library.classLoans.borrow");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const classes = useClassesQuery();
  const [classId, setClassId] = useState("");
  const [title, setTitle] = useState<LibraryTitle | null>(null);
  const [preview, setPreview] = useState<LibraryClassLoanPreview | null>(null);

  const previewMutation = usePreviewClassLoansMutation();
  const commitMutation = useCommitClassLoansMutation();

  const classOptions = (classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  function runPreview() {
    if (!classId || !title) return;
    setPreview(null);
    previewMutation.mutate(
      { class_id: classId, title_id: title.id },
      {
        onSuccess: setPreview,
        onError: (error) => {
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  function commit() {
    if (!preview || preview.pairs.length === 0) return;
    commitMutation.mutate(
      {
        pairs: preview.pairs.map((pair) => ({
          student_user_id: pair.student_user_id,
          barcode: pair.barcode,
        })),
      },
      {
        onSuccess: (result) => {
          toast.success(t("committed", { count: result.loans.length }));
          setPreview(null);
          setClassId("");
          setTitle(null);
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
              setPreview(null);
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
              setPreview(null);
            }}
            onClear={() => {
              setTitle(null);
              setPreview(null);
            }}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          loading={previewMutation.isPending}
          disabled={!classId || !title}
          onClick={runPreview}
        >
          {t("preview")}
        </Button>
      </div>

      {preview && (
        <div className="flex flex-col gap-3">
          {preview.pairs.length === 0 ? (
            <EmptyState
              icon={<domainIcons.library aria-hidden="true" />}
              title={t("previewEmptyTitle")}
              description={t("previewEmptyBody")}
            />
          ) : (
            <ul className="flex flex-col gap-1">
              {preview.pairs.map((pair) => (
                <li
                  key={pair.student_user_id}
                  className="flex items-center justify-between rounded-xs border border-border px-3 py-2 text-[13px]"
                >
                  <span className="text-fg">{pair.student_name}</span>
                  <span className="text-fg-muted">{pair.barcode}</span>
                </li>
              ))}
            </ul>
          )}

          {preview.rejected.length > 0 && (
            <div className="flex flex-col gap-1 rounded-xs border border-status-absent/40 bg-status-absent/5 p-3">
              <span className="text-[13px] font-medium text-status-absent">
                {t("rejectedTitle")}
              </span>
              <ul className="flex flex-col gap-1">
                {preview.rejected.map((item) => (
                  <li key={item.student_user_id} className="text-[13px] text-fg">
                    {item.student_name}: {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.pairs.length > 0 && (
            <div>
              <Button type="button" loading={commitMutation.isPending} onClick={commit}>
                {t("commit", { count: preview.pairs.length })}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
