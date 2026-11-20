"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilteredEmptyState,
  domainIcons,
  useToast,
  type DataTableFilterDef,
} from "@newsekolah/ui";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useRememberedViewState } from "../../../lib/view-state/view-state-provider";
import { useClassesQuery } from "../../reference/api";
import {
  type SPCandidate,
  useDisciplinePolicyQuery,
  useIssueWarningLetterMutation,
  useSPCandidatesQuery,
} from "../api";
import { studentDisciplineHref } from "../href";
import { dueLevels } from "../lib/sp-due-levels";

const PAGE_SIZE = 25;

/** The letter a counselor asked to issue, held until they confirm it. */
interface PendingIssue {
  candidate: SPCandidate;
  level: number;
  label: string;
}

export function AtRiskPanel(): ReactElement {
  const t = useTranslations("app.discipline.warningLetters.atRisk");
  const router = useRouter();
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();
  const canIssue = useCan("issue_warning_letters");
  // The policy is set from a header action only settings managers see.
  const canManagePolicy = useCan("manage_settings");

  const [classId, setClassId] = useUrlState<string>("class_id", () => true, "");
  const [level, setLevel] = useUrlState<string>("level", () => true, "");
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
  // A letter gets a number and goes on the record at once, so it asks first.
  const [pendingIssue, setPendingIssue] = useState<PendingIssue | null>(null);

  const filtering = search !== "" || classId !== "" || level !== "";
  function resetFilters() {
    setSearch("");
    setClassId("");
    setLevel("");
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  function confirmIssue() {
    if (!pendingIssue) return;
    const { candidate, level: letterLevel, label } = pendingIssue;
    issue.mutate(
      { student_user_id: candidate.student_user_id, level: letterLevel },
      {
        onSuccess: () => {
          setPendingIssue(null);
          toast.success(t("issued", { level: label }));
        },
        // On failure the dialog stays open so the counselor can try again.
        // "Already issued" means the letter exists (another tab or
        // counselor got there first): that is done, not a failure.
        onError: (error) => {
          if (error instanceof ApiError && error.code === "WARNING_LETTER_ALREADY_ISSUED") {
            setPendingIssue(null);
            toast.info(t("alreadyIssued", { level: label }));
            return;
          }
          toast.error(
            error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
          );
        },
      },
    );
  }

  const allRows = candidates.data?.data ?? [];
  const rows = allRows.slice(0, pagination.pageSize);
  const hasNextPage = allRows.length > pagination.pageSize;
  const rowCount = pagination.pageIndex * pagination.pageSize + rows.length + (hasNextPage ? 1 : 0);

  const classOptions = (classes.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const levelOptions = levels.map((l) => ({ value: String(l.level), label: l.label }));

  const filters: DataTableFilterDef[] = [
    {
      id: "class",
      label: t("filters.class"),
      value: classId,
      onChange: (value) => {
        setClassId(value);
        setPagination((p) => ({ ...p, pageIndex: 0 }));
      },
      options: classOptions,
    },
    {
      id: "level",
      label: t("filters.level"),
      value: level,
      onChange: (value) => {
        setLevel(value);
        setPagination((p) => ({ ...p, pageIndex: 0 }));
      },
      options: levelOptions,
    },
  ];

  const columns = useMemo<ColumnDef<SPCandidate>[]>(
    () => [
      {
        id: "student",
        header: t("columns.student"),
        enableSorting: false,
        // Plain text: the row opens the student's discipline record, so the
        // row has one destination, as in the ledger.
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-fg">{row.original.student_name}</span>
            <span className="text-caption text-fg-muted">
              {row.original.nis} · {row.original.class_name}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "total_points",
        header: t("columns.points"),
        enableSorting: false,
        meta: { align: "end" },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {t("pointsValue", { points: row.original.total_points })}
          </span>
        ),
      },
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
              onClick={(e) => {
                e.stopPropagation();
                setPendingIssue({
                  candidate: row.original,
                  level: nextDue.level,
                  label: nextDue.label,
                });
              }}
            >
              {t("issue", { level: nextDue.label })}
            </Button>
          );
        },
      },
    ],
    [t, levels, levelLabel, canIssue],
  );

  // A failed policy load is not the same as no policy: say so and offer a retry.
  if (policy.isError) {
    return <QueryError retry={() => void policy.refetch()} error={policy.error} />;
  }

  if (policy.isSuccess && levels.length === 0) {
    return (
      <Alert variant="info" title={t("noPolicyTitle")}>
        {canManagePolicy ? t("noPolicyBody") : t("noPolicyBodyAsk")}
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:h-full md:min-h-0">
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
          filters={filters}
          isLoading={candidates.isLoading}
          error={candidates.error}
          onRetry={() => void candidates.refetch()}
          getRowId={(item) => item.student_user_id}
          onRowActivate={(item) => {
            router.push(studentDisciplineHref(item.student_user_id));
          }}
          toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
          fillHeight
          emptyState={
            filtering ? (
              <FilteredEmptyState onReset={resetFilters} />
            ) : (
              <EmptyState
                icon={<domainIcons.violation aria-hidden="true" />}
                title={t("emptyTitle")}
                description={t("emptyBody")}
              />
            )
          }
        />
      </div>

      <ConfirmDialog
        open={pendingIssue !== null}
        onOpenChange={(open) => {
          if (!open) setPendingIssue(null);
        }}
        title={t("issueConfirm.title", {
          level: pendingIssue?.label ?? "",
          student: pendingIssue?.candidate.student_name ?? "",
        })}
        description={t("issueConfirm.body")}
        confirmLabel={t("issue", { level: pendingIssue?.label ?? "" })}
        confirming={issue.isPending}
        onConfirm={confirmIssue}
      />
    </div>
  );
}
