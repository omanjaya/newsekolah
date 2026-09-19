"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Skeleton,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { GraduationCap } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useAcademicYearsQuery } from "../../academic/api";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import {
  type PromotionAction,
  type PromotionOverride,
  type PromotionPlanItem,
  useClassesForYearQuery,
  useCommitPromotionMutation,
  usePreviewPromotionMutation,
} from "../api";

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
  const fromClassMap = useLookup(fromClasses.data?.data);
  const toClasses = useClassesForYearQuery(toYearId);
  const toClassOptions = (toClasses.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  // Batch directory lookup instead of one GET /v1/users/{id} per row: a
  // school-wide plan can list ~900 students, so a per-row fetch would fire
  // ~900 requests and ~1800 Selects worth of re-render on every override.
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);

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

  function setOverride(row: PromotionPlanItem, override: PromotionOverride) {
    setOverrides((prev) => ({ ...prev, [row.student_user_id]: override }));
  }

  const columns = useMemo<ColumnDef<PromotionPlanItem>[]>(
    () => [
      {
        id: "student",
        header: t("table.student"),
        enableSorting: false,
        accessorFn: (row) => studentMap.get(row.student_user_id)?.name ?? row.student_user_id,
        cell: ({ row }) =>
          studentMap.get(row.original.student_user_id)?.name ?? row.original.student_user_id,
      },
      {
        id: "fromClass",
        header: t("table.fromClass"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-fg-muted">
            {fromClassMap.get(row.original.from_class_id)?.name ?? "-"}
          </span>
        ),
      },
      {
        id: "action",
        header: t("table.action"),
        enableSorting: false,
        cell: ({ row }) => (
          <Select
            options={ACTIONS.map((a) => ({ value: a, label: t(`action.${a}`) }))}
            value={row.original.action}
            onValueChange={(action) => {
              setOverride(row.original, {
                student_user_id: row.original.student_user_id,
                action: action as PromotionAction,
                target_class_id:
                  action === "promote" || action === "retain"
                    ? row.original.target_class_id
                    : undefined,
              });
            }}
            className="w-32"
          />
        ),
      },
      {
        id: "targetClass",
        header: t("table.targetClass"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.action === "promote" || row.original.action === "retain" ? (
            <Select
              options={toClassOptions}
              value={row.original.target_class_id ?? ""}
              onValueChange={(targetClassId) => {
                setOverride(row.original, {
                  student_user_id: row.original.student_user_id,
                  action: row.original.action,
                  target_class_id: targetClassId,
                });
              }}
              placeholder={t("table.chooseClass")}
              invalid={row.original.unresolved}
              className="w-40"
            />
          ) : null,
      },
    ],
    [t, studentMap, fromClassMap, toClassOptions],
  );

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the form,
    // banners, and summary badges stay fixed; once a plan loads, the table
    // takes the remaining height and scrolls its rows internally.
    <div className="flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
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
        <div className="flex flex-col gap-3 md:min-h-0 md:flex-1">
          <div className="flex flex-wrap gap-2 text-[13px]">
            {ACTIONS.map((action) => (
              <Badge key={action} variant="neutral">
                {t(`action.${action}`)}: {summary.counts[action]}
              </Badge>
            ))}
            {summary.unresolvedCount > 0 && (
              <Badge variant="accent">{t("unresolvedCount", { n: summary.unresolvedCount })}</Badge>
            )}
          </div>

          <div className="md:min-h-0 md:flex-1">
            <DataTable
              stateKey="features/promotion/components/promotion-view:1"
              mode="local"
              data={rows}
              columns={columns}
              rowCount={rows.length}
              pagination={{ pageIndex: 0, pageSize: 50 }}
              onPaginationChange={() => undefined}
              sorting={[]}
              onSortingChange={() => undefined}
              globalFilter=""
              getRowId={(r) => r.student_user_id}
              fillHeight
              emptyState={
                <EmptyState
                  icon={<domainIcons.users aria-hidden="true" />}
                  title={t("emptyTitle")}
                  description={t("emptyBody")}
                />
              }
            />
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
        </div>
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
