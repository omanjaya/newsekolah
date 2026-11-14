"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  FormActions,
  FormSection,
  NumberInput,
  Skeleton,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useGradingScaleQuery, useUpdateGradingScaleMutation } from "../api";
import { fromText, toText } from "../lib/number-text";

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
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("scaleTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        {isError && <QueryError retry={() => refetch()} />}
        <form
          className="flex max-w-xl flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <FormSection>
            <Field label={t("scaleMin")}>
              <NumberInput
                value={fromText(active.min)}
                onChange={(value) => {
                  setForm({ ...active, min: toText(value) });
                }}
              />
            </Field>
            <Field label={t("scaleMax")}>
              <NumberInput
                value={fromText(active.max)}
                onChange={(value) => {
                  setForm({ ...active, max: toText(value) });
                }}
              />
            </Field>
            <Field label={t("reportIncreaseMax")}>
              <NumberInput
                value={fromText(active.report_increase_max)}
                onChange={(value) => {
                  setForm({ ...active, report_increase_max: toText(value) });
                }}
              />
            </Field>
            <Field label={t("defaultKktp")}>
              <NumberInput
                value={fromText(active.default_kktp)}
                onChange={(value) => {
                  setForm({ ...active, default_kktp: toText(value) });
                }}
              />
            </Field>
            <Field label={t("roundDecimal")}>
              <NumberInput
                min={0}
                max={4}
                value={fromText(active.round_decimal)}
                onChange={(value) => {
                  setForm({ ...active, round_decimal: toText(value) });
                }}
              />
            </Field>
          </FormSection>
          <FormActions>
            <Button type="submit" loading={update.isPending}>
              {t("scaleSave")}
            </Button>
          </FormActions>
        </form>
      </CardContent>
    </Card>
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
