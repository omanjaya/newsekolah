"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  List,
  ListRow,
  Select,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useClassesQuery } from "../../reference/api";
import { StudentLink } from "../../students/components/student-link";
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

  // The class list needs view_academic_data, which the librarian role lacks:
  // skip the request (it would 403) and say why the picker is empty.
  const canViewClasses = useCan("view_academic_data");
  const classes = useClassesQuery(canViewClasses);
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
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("heading")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>

      <div className="grid items-end gap-4 px-5 pb-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
        <Field label={t("classLabel")}>
          <Select
            options={classOptions}
            value={classId}
            onValueChange={(value) => {
              setClassId(value);
              setPreview(null);
            }}
            placeholder={
              !canViewClasses
                ? t("classesUnavailable")
                : classes.isLoading
                  ? t("loadingClasses")
                  : t("classPlaceholder")
            }
            disabled={!canViewClasses || classes.isLoading}
          />
        </Field>
        <Field label={t("titleLabel")}>
          {(control) => (
            <ClassTitlePicker
              id={control.id}
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
          )}
        </Field>
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
        <div className="flex flex-col gap-4 border-t border-line pt-4">
          {preview.rejected.length > 0 && (
            <Alert tone="danger" title={t("rejectedTitle")} className="mx-5">
              <ul className="flex flex-col gap-1">
                {preview.rejected.map((item) => (
                  <li key={item.student_user_id}>
                    {item.student_name}: {item.reason}
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          {preview.pairs.length === 0 ? (
            <EmptyState
              icon={<domainIcons.library aria-hidden="true" />}
              title={t("previewEmptyTitle")}
              description={t("previewEmptyBody")}
            />
          ) : (
            <List aria-label={t("pairsLabel")} data-testid="class-loan-pairs">
              {preview.pairs.map((pair) => (
                <ListRow
                  key={pair.student_user_id}
                  title={
                    <StudentLink studentId={pair.student_user_id} tab="library">
                      {pair.student_name}
                    </StudentLink>
                  }
                  trailing={
                    <span className="text-body-sm tabular-nums text-fg-muted">{pair.barcode}</span>
                  }
                />
              ))}
            </List>
          )}

          {preview.pairs.length > 0 && (
            <div className="flex justify-end border-t border-line p-4">
              <Button
                size="lg"
                className="max-sm:w-full"
                loading={commitMutation.isPending}
                onClick={commit}
              >
                {t("commit", { count: preview.pairs.length })}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
