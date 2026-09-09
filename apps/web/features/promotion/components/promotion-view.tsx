"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Skeleton,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import {
  type PromotionAction,
  type PromotionOverride,
  type PromotionPlanItem,
  useAcademicYearsQuery,
  useClassesForYearQuery,
  useCommitPromotionMutation,
  useIdNameMap,
  usePreviewPromotionMutation,
  useStudentNameQuery,
} from "../api";

/** One roster cell: the student's name once it loads, the raw id until then or if it fails to load. */
function StudentName({ studentUserId }: { studentUserId: string }): ReactElement {
  const query = useStudentNameQuery(studentUserId);
  return <>{query.data?.name ?? studentUserId}</>;
}

const ACTIONS: PromotionAction[] = ["promote", "retain", "graduate", "transfer"];

/** Preview and confirm bulk class promotion from one academic year into the next. */
export function PromotionView(): ReactElement {
  const t = useTranslations("app.promotion");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const years = useAcademicYearsQuery();
  const yearOptions = years.data?.data ?? [];

  const [fromYearId, setFromYearId] = useState("");
  const [toYearId, setToYearId] = useState("");
  const [plan, setPlan] = useState<PromotionPlanItem[] | undefined>(undefined);
  const [overrides, setOverrides] = useState<Record<string, PromotionOverride>>({});
  const [confirming, setConfirming] = useState(false);
  const [effectiveOn, setEffectiveOn] = useState(() => new Date().toISOString().slice(0, 10));

  const fromClasses = useClassesForYearQuery(fromYearId);
  const fromClassMap = useIdNameMap(fromClasses.data?.data);
  const toClasses = useClassesForYearQuery(toYearId);
  const toClassOptions = (toClasses.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }));

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
      { from_year_id: fromYearId, to_year_id: toYearId, overrides: Object.values(overrides) },
      {
        onSuccess: (res) => {
          setPlan(res.data);
        },
        onError: handleError,
      },
    );
  }

  const rows = useMemo(
    () =>
      (plan ?? []).map((item) => ({
        ...item,
        ...overrides[item.student_user_id],
      })),
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

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <p className="text-[13px] text-fg-muted">{t("description")}</p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("fromYear")}</span>
          <Select
            options={yearOptions.map((y) => ({ value: y.id, label: y.label }))}
            value={fromYearId}
            onValueChange={setFromYearId}
            className="w-56"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("toYear")}</span>
          <Select
            options={yearOptions.map((y) => ({ value: y.id, label: y.label }))}
            value={toYearId}
            onValueChange={setToYearId}
            className="w-56"
          />
        </label>
        <Button
          onClick={runPreview}
          loading={preview.isPending}
          disabled={!fromYearId || !toYearId || fromYearId === toYearId}
        >
          {t("preview")}
        </Button>
      </div>

      {fromYearId && fromYearId === toYearId && (
        <p className="text-[13px] text-status-absent">{t("sameYearError")}</p>
      )}

      {preview.isPending ? (
        <Skeleton className="h-64 w-full" aria-busy="true" />
      ) : plan?.length === 0 ? (
        <EmptyState
          icon={<domainIcons.users aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        plan && (
          <>
            <div className="flex flex-wrap gap-2 text-[13px]">
              {ACTIONS.map((action) => (
                <Badge key={action} variant="neutral">
                  {t(`action.${action}`)}: {summary.counts[action]}
                </Badge>
              ))}
              {summary.unresolvedCount > 0 && (
                <Badge variant="accent">
                  {t("unresolvedCount", { n: summary.unresolvedCount })}
                </Badge>
              )}
            </div>

            <div className="overflow-x-auto rounded-xs border border-border">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead className="bg-bg text-left text-fg-muted">
                  <tr>
                    <th className="px-3 py-2">{t("table.student")}</th>
                    <th className="px-3 py-2">{t("table.fromClass")}</th>
                    <th className="px-3 py-2">{t("table.action")}</th>
                    <th className="px-3 py-2">{t("table.targetClass")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.student_user_id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <StudentName studentUserId={row.student_user_id} />
                      </td>
                      <td className="px-3 py-2 text-fg-muted">
                        {fromClassMap.get(row.from_class_id)?.name ?? "-"}
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          options={ACTIONS.map((a) => ({ value: a, label: t(`action.${a}`) }))}
                          value={row.action}
                          onValueChange={(action) => {
                            setOverrides((prev) => ({
                              ...prev,
                              [row.student_user_id]: {
                                student_user_id: row.student_user_id,
                                action: action as PromotionAction,
                                target_class_id:
                                  action === "promote" || action === "retain"
                                    ? row.target_class_id
                                    : undefined,
                              },
                            }));
                          }}
                          className="w-32"
                        />
                      </td>
                      <td className="px-3 py-2">
                        {(row.action === "promote" || row.action === "retain") && (
                          <Select
                            options={toClassOptions}
                            value={row.target_class_id ?? ""}
                            onValueChange={(targetClassId) => {
                              setOverrides((prev) => ({
                                ...prev,
                                [row.student_user_id]: {
                                  student_user_id: row.student_user_id,
                                  action: row.action,
                                  target_class_id: targetClassId,
                                },
                              }));
                            }}
                            placeholder={t("table.chooseClass")}
                            invalid={row.unresolved}
                            className="w-40"
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="font-medium">{t("effectiveOn")}</span>
                <Input
                  type="date"
                  value={effectiveOn}
                  onChange={(e) => {
                    setEffectiveOn(e.target.value);
                  }}
                  className="w-44"
                />
              </label>
              <Button
                onClick={() => {
                  setConfirming(true);
                }}
                disabled={summary.unresolvedCount > 0}
              >
                {t("commit")}
              </Button>
              {summary.unresolvedCount > 0 && (
                <p className="text-[13px] text-status-absent">{t("resolveBeforeCommit")}</p>
              )}
            </div>
          </>
        )
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("confirmTitle")}
        description={t("confirmBody", { n: rows.length })}
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
              onSuccess: () => {
                setConfirming(false);
                setPlan(undefined);
                setOverrides({});
                toast.success(t("committed"));
              },
              onError: handleError,
            },
          );
        }}
      />
    </div>
  );
}
