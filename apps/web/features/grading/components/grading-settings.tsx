"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  Select,
  Skeleton,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSubjectsQuery } from "../../reference/api";
import {
  type GradeRange,
  useCreateGradeRangeMutation,
  useDeleteGradeRangeMutation,
  useGradeRangesQuery,
  useGradingScaleQuery,
  useUpdateGradingScaleMutation,
} from "../api";

/**
 * The school-wide grading policy: the 0-100 scale used across every
 * gradebook, and the ranges that cap how much a manual report-score
 * increase may add for a given raw-score band. Gated by manage_settings
 * at the call site (grading-view.tsx).
 */
export function GradingSettings(): ReactElement {
  return (
    <div className="flex flex-col gap-8">
      <ScaleForm />
      <RangesList />
    </div>
  );
}

function ScaleForm(): ReactElement {
  const t = useTranslations("app.grading.settings");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { data, isLoading } = useGradingScaleQuery();
  const update = useUpdateGradingScaleMutation();
  const [form, setForm] = useState<{
    min: string;
    max: string;
    report_increase_max: string;
    default_kktp: string;
    round_decimal: string;
  } | null>(null);

  const active = form ?? (data ? toFormState(data) : null);

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
      <h2 className="text-[16px] font-medium text-fg">{t("scaleTitle")}</h2>
      <form
        className="grid max-w-md grid-cols-2 gap-4"
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
        <div className="col-span-2 flex justify-end">
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

function RangesList(): ReactElement {
  const t = useTranslations("app.grading.settings");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const { data, isLoading } = useGradeRangesQuery();
  const subjects = useSubjectsQuery();
  const create = useCreateGradeRangeMutation();
  const remove = useDeleteGradeRangeMutation();
  const [pendingDelete, setPendingDelete] = useState<GradeRange | null>(null);
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [increase, setIncrease] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const subjectOptions = [
    { value: "", label: t("rangeAllSubjects") },
    ...(subjects.data?.data ?? []).map((s) => ({ value: s.id, label: s.name })),
  ];
  const subjectMap = new Map((subjects.data?.data ?? []).map((s) => [s.id, s.name]));

  async function addRange() {
    if (!minScore.trim() || !maxScore.trim() || !increase.trim()) return;
    try {
      await create.mutateAsync({
        min_score: Number(minScore),
        max_score: Number(maxScore),
        increase_amount: Number(increase),
        ...(subjectId ? { subject_id: subjectId } : {}),
      });
      toast.success(t("rangeSaved"));
      setMinScore("");
      setMaxScore("");
      setIncrease("");
      setSubjectId("");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
      );
    }
  }

  const ranges = data?.data ?? [];

  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <h2 className="text-[16px] font-medium text-fg">{t("rangesTitle")}</h2>
      <p className="text-[13px] text-fg-muted">{t("rangesHint")}</p>

      {isLoading ? (
        <Skeleton className="h-24 w-full" aria-busy="true" />
      ) : ranges.length === 0 ? (
        <EmptyState
          icon={<domainIcons.grades aria-hidden="true" />}
          title={t("rangesEmptyTitle")}
          description={t("rangesEmptyBody")}
        />
      ) : (
        <ul className="divide-y divide-border rounded-sm border border-border">
          {ranges.map((range) => (
            <li key={range.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-[13px] text-fg">
                {t("rangeRow", {
                  min: range.min_score,
                  max: range.max_score,
                  increase: range.increase_amount,
                  subject: range.subject_id
                    ? (subjectMap.get(range.subject_id) ?? t("rangeAllSubjects"))
                    : t("rangeAllSubjects"),
                })}
              </span>
              <IconButton
                icon={<Trash2 />}
                aria-label={t("rangeDelete")}
                onClick={() => {
                  setPendingDelete(range);
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void addRange();
        }}
      >
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("rangeMin")}</span>
          <Input
            type="number"
            className="w-24"
            value={minScore}
            onChange={(e) => {
              setMinScore(e.target.value);
            }}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("rangeMax")}</span>
          <Input
            type="number"
            className="w-24"
            value={maxScore}
            onChange={(e) => {
              setMaxScore(e.target.value);
            }}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("rangeIncrease")}</span>
          <Input
            type="number"
            className="w-24"
            value={increase}
            onChange={(e) => {
              setIncrease(e.target.value);
            }}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("rangeSubject")}</span>
          <Select
            options={subjectOptions}
            value={subjectId}
            onValueChange={setSubjectId}
            className="w-48"
          />
        </label>
        <Button type="submit" icon={<Plus />} loading={create.isPending}>
          {t("rangeAdd")}
        </Button>
      </form>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("rangeDeleteTitle")}
        description={t("rangeDeleteBody")}
        confirmLabel={t("rangeDelete")}
        destructive
        confirming={remove.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await remove.mutateAsync(pendingDelete.id);
            toast.success(t("rangeDeleted"));
          } catch (error) {
            toast.error(
              error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
            );
          } finally {
            setPendingDelete(null);
          }
        }}
      />
    </section>
  );
}
