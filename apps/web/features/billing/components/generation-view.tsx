"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  MonthPicker,
  Stat,
  StatGrid,
  Stepper,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarCheck, CircleSlash, Eye, FilePlus2, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { useDirectoryNames } from "../../reference/directory-names";
import {
  type BillCandidate,
  type GenerationSummary,
  currentPeriod,
  usePreviewGenerationMutation,
  useRunGenerationMutation,
} from "../api";
import { useBillingFormat } from "../lib/use-billing-format";

/** Generated bills are in rupiah; the preview carries no currency of its own. */
const GENERATION_CURRENCY = "IDR";

/**
 * Issuing a month's bills in three visible steps: pick the period, preview
 * who will be billed (and who is skipped because they already are), then
 * issue after a confirmation that names the count and the total. Running
 * it twice never duplicates a bill.
 */
export function GenerationView(): ReactElement {
  const t = useTranslations("app.billing.generation");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { me } = useSession();
  const { money, period: periodLabel } = useBillingFormat();

  const [period, setPeriod] = useState(currentPeriod(me?.tenant.timezone));
  const [preview, setPreview] = useState<GenerationSummary | null>(null);
  const [result, setResult] = useState<GenerationSummary | null>(null);
  const [confirming, setConfirming] = useState(false);

  const previewMutation = usePreviewGenerationMutation();
  const runMutation = useRunGenerationMutation();

  const rows = preview?.created ?? [];
  const studentMap = useDirectoryNames(rows.map((item) => item.student_user_id));
  const total = rows.reduce((sum, c) => sum + c.amount_minor, 0);
  const step = result ? 3 : preview ? (rows.length > 0 ? 2 : 1) : 0;

  const columns = useMemo<ColumnDef<BillCandidate>[]>(
    () => [
      {
        id: "student",
        header: t("columns.student"),
        enableSorting: false,
        meta: { card: "title" },
        cell: ({ row }) =>
          studentMap.get(row.original.student_user_id)?.name ?? t("unknownStudent"),
      },
      {
        accessorKey: "fee_type_name",
        header: t("columns.feeType"),
        enableSorting: false,
        meta: { card: "subtitle" },
      },
      {
        id: "period",
        header: t("columns.period"),
        enableSorting: false,
        cell: ({ row }) => periodLabel(row.original.period),
      },
      {
        id: "amount",
        header: t("columns.amount"),
        enableSorting: false,
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {money(row.original.amount_minor, GENERATION_CURRENCY)}
          </span>
        ),
      },
    ],
    [t, studentMap, periodLabel, money],
  );

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
    <>
      <Stepper
        variant="compact"
        currentIndex={step}
        steps={[
          { id: "period", label: t("steps.period") },
          { id: "preview", label: t("steps.preview") },
          { id: "issue", label: t("steps.issue") },
        ]}
      />
      <Card padding="md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label={t("period")} className="sm:w-60">
            <MonthPicker
              value={period}
              onChange={(next) => {
                setPeriod(next);
                setPreview(null);
                setResult(null);
              }}
              today={todayInZone(me?.tenant.timezone)}
              clearable={false}
            />
          </Field>
          <Button
            variant={preview ? "secondary" : "primary"}
            icon={<Eye />}
            loading={previewMutation.isPending}
            disabled={period === ""}
            onClick={runPreview}
          >
            {t("preview")}
          </Button>
        </div>
      </Card>

      {result && (
        <Alert tone="success" title={t("resultTitle")}>
          {t("resultBody", { created: result.created.length, skipped: result.skipped })}
        </Alert>
      )}

      {!preview && !result && (
        <EmptyState icon={<CalendarCheck />} title={t("startTitle")} description={t("startBody")} />
      )}

      {preview && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <StatGrid variant="strip" aria-label={t("summaryLabel")}>
              <Stat icon={<FilePlus2 />} tone="green" label={t("toCreate")} value={rows.length} />
              <Stat
                icon={<CircleSlash />}
                tone="amber"
                label={t("skipped")}
                value={preview.skipped}
              />
              <Stat
                icon={<Wallet />}
                tone="blue"
                label={t("total")}
                value={<span className="tabular-nums">{money(total, GENERATION_CURRENCY)}</span>}
              />
            </StatGrid>
            {rows.length > 0 && (
              <Button
                onClick={() => {
                  setConfirming(true);
                }}
              >
                {t("generate")}
              </Button>
            )}
          </div>
          <div className="flex flex-col md:min-h-0 md:flex-1">
            <DataTable
              stateKey="features/billing/components/generation-view:1"
              mode="local"
              data={rows}
              columns={columns}
              rowCount={rows.length}
              searchable={false}
              getRowId={(item) => `${item.fee_type_id}-${item.student_user_id}-${item.period}`}
              emptyState={
                <EmptyState
                  icon={<domainIcons.billing />}
                  title={t("emptyTitle")}
                  description={t("emptyBody")}
                />
              }
            />
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("confirmTitle")}
        description={t("confirmBody", {
          count: rows.length,
          total: money(total, GENERATION_CURRENCY),
        })}
        confirmLabel={t("generate")}
        confirming={runMutation.isPending}
        onConfirm={runGeneration}
      />
    </>
  );
}
