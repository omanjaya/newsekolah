"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Select,
  domainIcons,
  useToast,
} from "@newsekolah/ui";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useRememberedViewState } from "../../../lib/view-state/view-state-provider";
import { useClassesQuery } from "../../reference/api";
import {
  type SPCandidate,
  type SPLevel,
  useDisciplinePolicyQuery,
  useIssueWarningLetterMutation,
  useSPCandidatesQuery,
} from "../api";

const PAGE_SIZE = 25;

/**
 * Levels the student has reached but not yet been issued, ascending. The
 * API refuses issuing out of order, so only `dueLevels[0]` is ever offered.
 */
function dueLevels(candidate: SPCandidate, levels: SPLevel[]): SPLevel[] {
  return levels
    .filter(
      (level) =>
        candidate.total_points >= level.min_points &&
        !candidate.issued_levels.includes(level.level),
    )
    .sort((a, b) => a.level - b.level);
}

export function AtRiskPanel(): ReactElement {
  const t = useTranslations("app.discipline.warningLetters.atRisk");
  const router = useRouter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canIssue = useCan("issue_warning_letters");

  const [classId, setClassId] = useRememberedViewState("at-risk-class", "");
  const [level, setLevel] = useRememberedViewState("at-risk-level", "");
  const [search, setSearch] = useRememberedViewState("at-risk-search", "");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });

  const classes = useClassesQuery();
  const policy = useDisciplinePolicyQuery();
  const levels = useMemo(() => policy.data?.levels ?? [], [policy.data]);
  const levelLabel = useMemo(() => new Map(levels.map((l) => [l.level, l.label])), [levels]);

  // Ask for one extra row to know whether a next page exists: the API
  // reports no total, only the page it returned.
  const candidates = useSPCandidatesQuery({
    classId,
    level,
    search,
    limit: pagination.pageSize + 1,
    offset: pagination.pageIndex * pagination.pageSize,
  });
  const issue = useIssueWarningLetterMutation();

  const allRows = candidates.data?.data ?? [];
  const rows = allRows.slice(0, pagination.pageSize);
  const hasNextPage = allRows.length > pagination.pageSize;
  const rowCount = pagination.pageIndex * pagination.pageSize + rows.length + (hasNextPage ? 1 : 0);

  const classOptions = [
    { value: "all", label: t("filters.classAll") },
    ...(classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];
  const levelOptions = [
    { value: "all", label: t("filters.levelAll") },
    ...levels.map((l) => ({ value: String(l.level), label: l.label })),
  ];

  const columns = useMemo<ColumnDef<SPCandidate>[]>(
    () => [
      {
        id: "student",
        header: t("columns.student"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-fg">{row.original.student_name}</span>
            <span className="text-[12px] text-fg-muted">
              {row.original.nis} · {row.original.class_name}
            </span>
          </div>
        ),
      },
      { accessorKey: "total_points", header: t("columns.points"), enableSorting: false },
      {
        id: "due",
        header: t("columns.due"),
        enableSorting: false,
        cell: ({ row }) => {
          const due = dueLevels(row.original, levels);
          if (due.length === 0) return <span className="text-fg-muted">-</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {due.map((l) => (
                <Badge key={l.level} variant="accent">
                  {l.label}
                </Badge>
              ))}
            </div>
          );
        },
      },
      {
        id: "issued",
        header: t("columns.issued"),
        enableSorting: false,
        cell: ({ row }) => {
          const issuedLevels = row.original.issued_levels;
          if (issuedLevels.length === 0) return <span className="text-fg-muted">-</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {issuedLevels.map((lvl) => (
                <Badge key={lvl} variant="neutral">
                  {levelLabel.get(lvl) ?? lvl}
                </Badge>
              ))}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: t("columns.actions"),
        enableSorting: false,
        cell: ({ row }) => {
          const nextDue = dueLevels(row.original, levels)[0];
          if (!canIssue || !nextDue) return null;
          return (
            <Button
              size="sm"
              loading={issue.isPending}
              onClick={(e) => {
                e.stopPropagation();
                issue.mutate(
                  { student_user_id: row.original.student_user_id, level: nextDue.level },
                  {
                    onSuccess: () => {
                      toast.success(t("issued", { level: nextDue.label }));
                    },
                    onError: (error) => {
                      toast.error(
                        error instanceof ApiError
                          ? apiErrorMessage(error.code)
                          : apiErrorMessage("UNKNOWN"),
                      );
                    },
                  },
                );
              }}
            >
              {t("issue", { level: nextDue.label })}
            </Button>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- issue mutation identity is stable per render
    [t, levels, levelLabel, canIssue],
  );

  if (levels.length === 0 && !policy.isLoading) {
    return (
      <div className="rounded-sm border border-border bg-surface p-4 text-[13px] text-fg-muted">
        {t("noPolicyTitle")}
        <p className="mt-1">{t("noPolicyBody")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:h-full md:min-h-0">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("filters.class")}</span>
          <Select
            options={classOptions}
            value={classId || "all"}
            onValueChange={(v) => {
              setClassId(v === "all" ? "" : v);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            className="w-44"
            aria-label={t("filters.class")}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("filters.level")}</span>
          <Select
            options={levelOptions}
            value={level || "all"}
            onValueChange={(v) => {
              setLevel(v === "all" ? "" : v);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            className="w-40"
            aria-label={t("filters.level")}
          />
        </label>
      </div>

      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/discipline/components/at-risk-panel:1"
          data={rows}
          columns={columns}
          rowCount={rowCount}
          pagination={pagination}
          onPaginationChange={setPagination}
          sorting={[]}
          onSortingChange={() => undefined}
          globalFilter={search}
          onGlobalFilterChange={(value) => {
            setSearch(value);
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
          isLoading={candidates.isLoading}
          getRowId={(item) => item.student_user_id}
          onRowActivate={(item) => {
            router.push(`/discipline/students/${item.student_user_id}`);
          }}
          toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
          fillHeight
          emptyState={
            <EmptyState
              icon={<domainIcons.violation aria-hidden="true" />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
            />
          }
        />
      </div>
    </div>
  );
}
