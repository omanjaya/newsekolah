"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  DatePicker,
  EmptyState,
  Field,
  HeroCard,
  SkeletonList,
  Stat,
  StatGrid,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { ArrowUpRight, GraduationCap, LogOut, RotateCcw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useCallback, useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useSession } from "../../../lib/session/session-provider";
import { todayInZone } from "../../../lib/tenant-date";
import { useAcademicYearsQuery } from "../../academic/api";
import { AcademicWorkspaceLinks } from "../../academic/components/academic-workspace-links";
import {
  WizardProgress,
  YearPairStep,
  useYearPair,
} from "../../academic/components/year-pair-step";
import { useDirectoryNames } from "../../reference/directory-names";
import {
  type PromotionAction,
  type PromotionOverride,
  type PromotionPlanItem,
  useClassesForYearQuery,
  useCommitPromotionMutation,
  usePreviewPromotionMutation,
} from "../api";

import { PROMOTION_ACTIONS, PromotionPlanTable } from "./promotion-plan-table";

interface Done {
  from: string;
  to: string;
  applied: number;
  skipped: number;
}

/**
 * Class promotion from one academic year into the next, as a wizard:
 * choose the years, review the plan (decisions per student, changed one
 * by one or for every ticked row, filtered to what still needs a class),
 * then a result report that stays until the years change.
 */
export function PromotionView(): ReactElement {
  const t = useTranslations("app.promotion");
  const tFlow = useTranslations("app.academic.yearFlow");
  const tWorkspace = useTranslations("app.academic.workspace");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const { me } = useSession();
  const today = todayInZone(me?.tenant.timezone);
  const years = useAcademicYearsQuery();
  const yearOptions = years.data?.data ?? [];
  const { fromYearId, toYearId, setFromYearId, setToYearId } = useYearPair(yearOptions);
  const yearLabel = (id: string) => yearOptions.find((year) => year.id === id)?.label ?? "";

  const [previewResult, setPreviewResult] = useState<{
    from: string;
    to: string;
    plan: PromotionPlanItem[];
  } | null>(null);
  const plan =
    previewResult !== null && previewResult.from === fromYearId && previewResult.to === toYearId
      ? previewResult.plan
      : undefined;
  const [overrides, setOverrides] = useState<Record<string, PromotionOverride>>({});
  const [confirming, setConfirming] = useState(false);
  const [effectiveOn, setEffectiveOn] = useState(today);
  const [done, setDone] = useState<Done | null>(null);
  const result = done !== null && done.from === fromYearId && done.to === toYearId ? done : null;

  const fromClasses = useClassesForYearQuery(fromYearId);
  const toClasses = useClassesForYearQuery(toYearId);
  const fromClassOptions = (fromClasses.data?.data ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }));
  const toClassOptions = (toClasses.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  // Batch directory lookup instead of one GET /v1/users/{id} per row: a
  // school-wide plan can list ~900 students.
  const studentMap = useDirectoryNames((plan ?? []).map((item) => item.student_user_id));
  const studentName = useCallback((id: string) => studentMap.get(id)?.name ?? id, [studentMap]);

  const preview = usePreviewPromotionMutation();
  const commit = useCommitPromotionMutation();

  function handleError(error: unknown) {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  }

  function runPreview() {
    if (!fromYearId || !toYearId) return;
    preview.mutate(
      {
        from_year_id: fromYearId,
        to_year_id: toYearId,
        overrides: plan ? Object.values(overrides) : [],
      },
      {
        onSuccess: (res) => {
          if (!plan) setOverrides({});
          setPreviewResult({ from: fromYearId, to: toYearId, plan: res.data });
        },
        onError: handleError,
      },
    );
  }

  const rows = useMemo(
    () =>
      (plan ?? []).map((item) => {
        const override = overrides[item.student_user_id];
        if (!override) return item;
        const merged = { ...item, ...override };
        // A decision without a class needs none; one with a class is
        // resolved once the class is chosen.
        const unresolved =
          (merged.action === "promote" || merged.action === "retain") && !merged.target_class_id;
        return { ...merged, unresolved };
      }),
    [plan, overrides],
  );

  const summary = useMemo(() => {
    const counts: Record<PromotionAction, number> = {
      promote: 0,
      retain: 0,
      graduate: 0,
      transfer: 0,
    };
    let unresolvedCount = 0;
    for (const row of rows) {
      counts[row.action] += 1;
      if (row.unresolved) unresolvedCount += 1;
    }
    return { counts, unresolvedCount };
  }, [rows]);

  const applyOverrides = useCallback((next: PromotionOverride[]) => {
    setOverrides((prev) => {
      const merged = { ...prev };
      for (const override of next) merged[override.student_user_id] = override;
      return merged;
    });
  }, []);

  const step = result ? 2 : plan ? 1 : 0;
  const icons: Record<PromotionAction, ReactElement> = {
    promote: <ArrowUpRight />,
    retain: <RotateCcw />,
    graduate: <GraduationCap />,
    transfer: <LogOut />,
  };
  const tones = {
    promote: "green",
    retain: "amber",
    graduate: "blue",
    transfer: "purple",
  } as const;

  return (
    <AppPage
      variant="wide"
      title={tWorkspace("promotion")}
      description={t("description")}
      nav={<AcademicWorkspaceLinks area="years" />}
    >
      <WizardProgress
        current={step}
        labels={[tFlow("stepYears"), tFlow("stepReview"), tFlow("stepDone")]}
      />

      {result ? (
        <HeroCard
          tone="accent-soft"
          eyebrow={tFlow("doneEyebrow")}
          title={t("doneTitle", { year: yearLabel(result.to) })}
          meta={t("doneBody", { applied: result.applied, skipped: result.skipped })}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setDone(null);
              }}
            >
              {tFlow("startOver")}
            </Button>
          }
        />
      ) : (
        <YearPairStep
          years={yearOptions}
          fromYearId={fromYearId}
          toYearId={toYearId}
          onFromChange={setFromYearId}
          onToChange={setToYearId}
          onPreview={runPreview}
          previewing={preview.isPending}
          previewLabel={plan ? tFlow("previewAgain") : t("preview")}
        />
      )}

      {result ? null : preview.isPending ? (
        <SkeletonList rows={6} framed />
      ) : plan === undefined ? (
        <EmptyState
          icon={<GraduationCap aria-hidden="true" />}
          title={t("idleTitle")}
          description={t("idleBody")}
        />
      ) : plan.length === 0 ? (
        <EmptyState
          icon={<domainIcons.users aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <>
          <StatGrid variant="strip" aria-label={tFlow("summary")}>
            {PROMOTION_ACTIONS.map((action) => (
              <Stat
                key={action}
                icon={icons[action]}
                tone={tones[action]}
                label={t(`action.${action}`)}
                value={summary.counts[action]}
              />
            ))}
            <Stat
              icon={<TriangleAlert />}
              tone={summary.unresolvedCount > 0 ? "red" : "green"}
              label={t("unresolvedLabel")}
              value={summary.unresolvedCount}
            />
          </StatGrid>

          <PromotionPlanTable
            rows={rows}
            studentName={studentName}
            fromClasses={fromClassOptions}
            toClasses={toClassOptions}
            onOverride={applyOverrides}
          />

          <Card padding="md">
            {summary.unresolvedCount > 0 && (
              <Alert tone="warning" title={t("unresolvedCount", { n: summary.unresolvedCount })}>
                {t("resolveBeforeCommit")}
              </Alert>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <Field label={t("effectiveOn")} className="sm:w-56">
                <DatePicker value={effectiveOn} onChange={setEffectiveOn} today={today} />
              </Field>
              <Button
                className="max-sm:w-full"
                onClick={() => {
                  setConfirming(true);
                }}
                disabled={summary.unresolvedCount > 0 || !effectiveOn}
              >
                {t("commit")}
              </Button>
            </div>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={confirming && plan !== undefined}
        onOpenChange={setConfirming}
        title={t("confirmTitle")}
        description={t("confirmBody", { n: rows.length })}
        confirmLabel={t("commit")}
        confirming={commit.isPending}
        onConfirm={() => {
          commit.mutate(
            {
              from_year_id: fromYearId,
              to_year_id: toYearId,
              overrides: Object.values(overrides),
              effective_on: effectiveOn,
            },
            {
              onSuccess: (response) => {
                setConfirming(false);
                setPreviewResult(null);
                setOverrides({});
                setDone({
                  from: fromYearId,
                  to: toYearId,
                  applied: response.applied.length,
                  skipped: response.skipped.length,
                });
                toast.success(t("committed"));
              },
              onError: handleError,
            },
          );
        }}
      />
    </AppPage>
  );
}
