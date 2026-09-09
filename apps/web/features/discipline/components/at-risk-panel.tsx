"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Alert,
  Button,
  DataTable,
  EmptyState,
  Skeleton,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useDirectoryQuery, useLookup } from "../../reference/api";
import {
  type PointTotal,
  useDisciplinePolicyQuery,
  useIssueNextDueWarningMutation,
  usePointTotalsQuery,
} from "../api";

export function AtRiskPanel(): ReactElement {
  const t = useTranslations("app.discipline.warningLetters.atRisk");
  const locale = useLocale() as Locale;
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canIssue = useCan("issue_warning_letters");

  const policy = useDisciplinePolicyQuery();
  const totals = usePointTotalsQuery();
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const issue = useIssueNextDueWarningMutation();

  const minThreshold = useMemo(() => {
    const points = (policy.data?.levels ?? []).map((level) => level.min_points);
    return points.length > 0 ? Math.min(...points) : null;
  }, [policy.data]);

  const atRisk = useMemo(() => {
    if (minThreshold === null) return [];
    return (totals.data?.data ?? [])
      .filter((row) => row.total_points >= minThreshold)
      .sort((a, b) => b.total_points - a.total_points);
  }, [totals.data, minThreshold]);

  const columns = useMemo<ColumnDef<PointTotal>[]>(
    () => [
      {
        id: "student",
        header: t("columns.student"),
        enableSorting: false,
        cell: ({ row }) =>
          studentMap.get(row.original.student_user_id)?.name ?? t("unknownStudent"),
      },
      { accessorKey: "total_points", header: t("columns.points"), enableSorting: false },
      {
        id: "lastOccurred",
        header: t("columns.lastOccurred"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.last_occurred_on
            ? formatDate(row.original.last_occurred_on, { locale })
            : "-",
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) =>
          canIssue ? (
            <Button
              size="sm"
              loading={issue.isPending}
              onClick={() => {
                issue.mutate(row.original.student_user_id, {
                  onSuccess: () => {
                    toast.success(t("issued"));
                  },
                  onError: (error) => {
                    toast.error(
                      error instanceof ApiError
                        ? apiErrorMessage(error.code)
                        : apiErrorMessage("UNKNOWN"),
                    );
                  },
                });
              }}
            >
              {t("issue")}
            </Button>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- issue mutation identity is stable per render
    [t, locale, studentMap, canIssue],
  );

  if (policy.isLoading || totals.isLoading)
    return <Skeleton className="h-40 w-full" aria-busy="true" />;

  if (minThreshold === null) {
    return (
      <Alert variant="warning" title={t("noPolicyTitle")}>
        {t("noPolicyBody")}
      </Alert>
    );
  }

  return (
    <DataTable
      data={atRisk}
      columns={columns}
      rowCount={atRisk.length}
      pagination={{ pageIndex: 0, pageSize: 50 }}
      onPaginationChange={() => undefined}
      sorting={[]}
      onSortingChange={() => undefined}
      globalFilter=""
      onGlobalFilterChange={() => undefined}
      getRowId={(item) => item.student_user_id}
      emptyState={
        <EmptyState
          icon={<domainIcons.violation aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      }
    />
  );
}
