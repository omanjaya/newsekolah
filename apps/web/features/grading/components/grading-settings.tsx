"use client";

import { ApiError } from "@newsekolah/api-client";
import { Button, Input, Skeleton, useToast } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useGradingScaleQuery, useUpdateGradingScaleMutation } from "../api";

import { GradeRangesEditor } from "./grade-ranges-editor";

/**
 * The school-wide grading scale (edit needs manage_settings) and the
 * report-score increase ranges (any manage_grades holder maintains their
 * own scope; manage_settings can target other teachers or the whole
 * school). Reachable from grading-view.tsx once either permission holds.
 */
export function GradingSettings({
  canManageSettings,
}: {
  canManageSettings: boolean;
}): ReactElement {
  return (
    <div className="flex flex-col gap-8">
      {canManageSettings && <ScaleForm />}
      <GradeRangesEditor canManageSettings={canManageSettings} />
    </div>
  );
}

function ScaleForm(): ReactElement {
  const t = useTranslations("app.grading.settings");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { data, isLoading, isError, refetch } = useGradingScaleQuery();
  const update = useUpdateGradingScaleMutation();
  const [form, setForm] = useState<{
    min: string;
    max: string;
    report_increase_max: string;
    default_kktp: string;
    round_decimal: string;
  } | null>(null);

  const active = form ?? (data ? toFormState(data) : null);

  if (isError && !data) return <QueryError retry={() => refetch()} />;

  if (isLoading || !active) {
    return <Skeleton className="h-48 w-full max-w-md" aria-busy="true" />;
  }

  async function save() {
    if (!active) return;
    try {
      await update.mutateAsync({
        min: Number(active.min),
        max: Number(active.max),
        report_increase_max: Number(active.report_increase_max),
        default_kktp: Number(active.default_kktp),
        round_decimal: Number(active.round_decimal),
      });
      toast.success(t("scaleSaved"));
      setForm(null);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      {isError && <QueryError retry={() => refetch()} />}
      <h2 className="text-[16px] font-medium text-fg">{t("scaleTitle")}</h2>
      <form
        className="grid max-w-md grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("scaleMin")}</span>
          <Input
            type="number"
            value={active.min}
            onChange={(e) => {
              setForm({ ...active, min: e.target.value });
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("scaleMax")}</span>
          <Input
            type="number"
            value={active.max}
            onChange={(e) => {
              setForm({ ...active, max: e.target.value });
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("reportIncreaseMax")}</span>
          <Input
            type="number"
            value={active.report_increase_max}
            onChange={(e) => {
              setForm({ ...active, report_increase_max: e.target.value });
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("defaultKktp")}</span>
          <Input
            type="number"
            value={active.default_kktp}
            onChange={(e) => {
              setForm({ ...active, default_kktp: e.target.value });
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("roundDecimal")}</span>
          <Input
            type="number"
            min={0}
            max={4}
            value={active.round_decimal}
            onChange={(e) => {
              setForm({ ...active, round_decimal: e.target.value });
            }}
          />
        </label>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" loading={update.isPending}>
            {t("scaleSave")}
          </Button>
        </div>
      </form>
    </section>
  );
}

function toFormState(scale: {
  min: number;
  max: number;
  report_increase_max: number;
  default_kktp: number;
  round_decimal: number;
}) {
  return {
    min: String(scale.min),
    max: String(scale.max),
    report_increase_max: String(scale.report_increase_max),
    default_kktp: String(scale.default_kktp),
    round_decimal: String(scale.round_decimal),
  };
}
