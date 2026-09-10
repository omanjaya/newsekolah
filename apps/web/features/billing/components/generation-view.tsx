"use client";

import { ApiError } from "@newsekolah/api-client";
import { type Locale, formatCurrency } from "@newsekolah/i18n";
import {
  Alert,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Input,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import {
  type BillCandidate,
  type GenerationSummary,
  currentPeriod,
  usePreviewGenerationMutation,
  useRunGenerationMutation,
} from "../api";

export function GenerationView(): ReactElement {
  const t = useTranslations("app.billing.generation");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);

  const [period, setPeriod] = useState(currentPeriod());
  const [preview, setPreview] = useState<GenerationSummary | null>(null);
  const [result, setResult] = useState<GenerationSummary | null>(null);
  const [confirming, setConfirming] = useState(false);

  const previewMutation = usePreviewGenerationMutation();
  const runMutation = useRunGenerationMutation();

  const rows = preview?.created ?? [];
  const total = rows.reduce((sum, c) => sum + c.amount_minor, 0);

  const columns: ColumnDef<BillCandidate>[] = [
    {
      id: "student",
      header: t("columns.student"),
      enableSorting: false,
      cell: ({ row }) => studentMap.get(row.original.student_user_id)?.name ?? t("unknownStudent"),
    },
    { accessorKey: "fee_type_name", header: t("columns.feeType"), enableSorting: false },
    { accessorKey: "period", header: t("columns.period"), enableSorting: false },
    {
      id: "amount",
      header: t("columns.amount"),
      enableSorting: false,
      cell: ({ row }) => formatCurrency(row.original.amount_minor, "IDR", { locale }),
    },
  ];

  function runPreview() {
    setResult(null);
    previewMutation.mutate(period, {
      onSuccess: (summary) => {
        setPreview(summary);
      },
      onError: (error) => {
        toast.error(
          error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
        );
      },
    });
  }

  function runGeneration() {
    runMutation.mutate(period, {
      onSuccess: (summary) => {
        setResult(summary);
        setPreview(null);
        setConfirming(false);
        toast.success(t("generated", { count: summary.created.length }));
      },
      onError: (error) => {
        setConfirming(false);
        toast.error(
          error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
        );
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("period")}</span>
          <Input
            type="month"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setPreview(null);
              setResult(null);
            }}
            className="w-44"
          />
        </label>
        <Button
          variant="secondary"
          size="sm"
          loading={previewMutation.isPending}
          disabled={period === ""}
          onClick={runPreview}
        >
          {t("preview")}
        </Button>
      </div>

      {result && (
        <Alert variant="info" title={t("resultTitle")}>
          {t("resultBody", { created: result.created.length, skipped: result.skipped })}
        </Alert>
      )}

      {preview && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-fg-muted">
              {t("previewSummary", {
                count: rows.length,
                skipped: preview.skipped,
                total: formatCurrency(total, "IDR", { locale }),
              })}
            </p>
            {rows.length > 0 && (
              <Button
                size="sm"
                onClick={() => {
                  setConfirming(true);
                }}
              >
                {t("generate")}
              </Button>
            )}
          </div>
          <DataTable
            data={rows}
            columns={columns}
            rowCount={rows.length}
            pagination={{ pageIndex: 0, pageSize: 50 }}
            onPaginationChange={() => undefined}
            sorting={[]}
            onSortingChange={() => undefined}
            globalFilter=""
            onGlobalFilterChange={() => undefined}
            isLoading={false}
            getRowId={(item) => `${item.fee_type_id}-${item.student_user_id}-${item.period}`}
            emptyState={
              <EmptyState
                icon={<domainIcons.billing aria-hidden="true" />}
                title={t("emptyTitle")}
                description={t("emptyBody")}
              />
            }
          />
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("confirmTitle")}
        description={t("confirmBody", {
          count: rows.length,
          total: formatCurrency(total, "IDR", { locale }),
        })}
        confirmLabel={t("generate")}
        confirming={runMutation.isPending}
        onConfirm={runGeneration}
      />
    </div>
  );
}
