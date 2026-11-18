"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import {
  Avatar,
  Button,
  DataTable,
  type DataTableFilterDef,
  EmptyState,
  FilteredEmptyState,
  SkeletonCards,
  SkeletonList,
} from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Settings2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan, useSession } from "../../../lib/session/session-provider";
import { useClassesQuery, useLookup } from "../../reference/api";
import { useDirectoryNames } from "../../reference/directory-names";
import { type RiskLevel, type StudentRisk, useAtRiskStudentsQuery } from "../api";
import { studentRiskHref } from "../href";

import { PolicyDialog } from "./policy-dialog";
import { RiskLevelBadge } from "./risk-level-badge";
import { RiskLevelSummary } from "./risk-level-summary";

/**
 * The early-warning list: who to check on, ranked by score. A homeroom
 * teacher's own class only, a counselor or school leadership sees every
 * class -- decided server-side (analytics service.resolveScope), not by
 * anything this screen chooses. The level tiles and the class filter
 * narrow the list; the search finds a student or a class by name.
 */
type RiskRow = StudentRisk & {
  student_name: string;
  class_name: string;
  level_label: string;
};

const LEVELS: RiskLevel[] = ["at_risk", "watch", "none"];

export function AtRiskStudentsView(): ReactElement {
  const t = useTranslations("app.analytics.list");
  const canManage = useCan("manage_early_warning_rules");
  const [policyOpen, setPolicyOpen] = useState(false);
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const router = useRouter();

  const { data, isLoading, error, refetch } = useAtRiskStudentsQuery();
  const classes = useClassesQuery();
  const classMap = useLookup(classes.data?.data);
  const levelLabel = useTranslations("app.analytics.level");
  const [level, setLevel] = useUrlState<RiskLevel | "">("level", ["", ...LEVELS], "");
  const [classId, setClassId] = useUrlState<string>("class_id", () => true, "");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const items = data?.data ?? [];
    return [...items].sort((a, b) => b.score - a.score);
  }, [data]);
  const studentMap = useDirectoryNames(rows.map((item) => item.student_user_id));

  // Searchable text lives in the row data, not in accessors closing over the
  // lookups: the table caches accessor values per row, so a name that
  // resolves after the rows would otherwise stay unsearchable.
  const tableRows = useMemo<RiskRow[]>(
    () =>
      rows
        .filter((item) => level === "" || item.level === level)
        .filter((item) => classId === "" || item.class_id === classId)
        .map((item) => ({
          ...item,
          student_name: studentMap.get(item.student_user_id)?.name ?? "",
          class_name: classMap.get(item.class_id)?.name ?? "",
          level_label: levelLabel(item.level),
        })),
    [rows, level, classId, studentMap, classMap, levelLabel],
  );

  // Only the classes that appear in the reader's own list.
  const classOptions = useMemo(() => {
    const ids = [...new Set(rows.map((row) => row.class_id))];
    return ids
      .map((id) => ({ value: id, label: classMap.get(id)?.name ?? "" }))
      .filter((option) => option.label !== "")
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, classMap]);
  const filters: DataTableFilterDef[] = [
    {
      id: "class",
      label: t("filters.class"),
      value: classId,
      onChange: setClassId,
      options: classOptions,
    },
  ];
  const filtering = level !== "" || classId !== "" || search !== "";
  const computedAt = rows[0]?.computed_at;

  const columns = useMemo<ColumnDef<RiskRow>[]>(
    () => [
      {
        accessorKey: "student_name",
        header: t("columns.student"),
        enableSorting: false,
        meta: { card: "title", label: t("columns.student") },
        // Plain text: the row opens the student's early-warning detail,
        // which links on to the profile. On a phone card the class is the
        // name's second line, so the card reads as one person.
        cell: ({ row }) => {
          const student = studentMap.get(row.original.student_user_id);
          if (!student) return t("unknownStudent");
          return (
            <div className="flex min-w-0 items-center gap-3">
              <Avatar size={32} name={student.name} decorative />
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{student.name}</span>
                {row.original.class_name && (
                  <span className="truncate text-caption font-normal text-fg-muted md:hidden">
                    {row.original.class_name}
                  </span>
                )}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "class_name",
        header: t("columns.class"),
        enableSorting: false,
        meta: { card: "hidden", label: t("columns.class") },
        cell: ({ row }) => row.original.class_name || "-",
      },
      {
        accessorKey: "level_label",
        header: t("columns.level"),
        enableSorting: false,
        meta: { card: "meta", label: t("columns.level") },
        cell: ({ row }) => (
          <RiskLevelBadge level={row.original.level} label={row.original.level_label} />
        ),
      },
      {
        accessorKey: "score",
        header: t("columns.score"),
        enableSorting: false,
        meta: { card: "meta", label: t("columns.score"), align: "end" },
        // Beside the level badge on a phone card, which has no column
        // header to name the number.
        cell: ({ row }) => (
          <span className="tabular-nums">
            <span className="md:hidden">{t("scoreValue", { score: row.original.score })}</span>
            <span className="max-md:hidden">{row.original.score}</span>
          </span>
        ),
      },
    ],
    [t, studentMap],
  );

  const policyAction = canManage
    ? [
        {
          label: t("policy"),
          icon: <Settings2 />,
          onSelect: () => {
            setPolicyOpen(true);
          },
        },
      ]
    : undefined;
  // No title, eyebrow or description of its own: the area's header (h1
  // "Konseling BK", or "Peringatan dini" for a reader with only this page)
  // stays put between its tabs. How the list is ordered is said above it.
  const page = {
    variant: "fit" as const,
    secondaryActions: policyAction,
  };

  if (isLoading) {
    return (
      <AppPage {...page}>
        <SkeletonCards count={3} />
        <SkeletonList rows={5} leading framed />
      </AppPage>
    );
  }

  if (error) {
    return (
      <AppPage {...page}>
        {canManage && policyOpen && <PolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} />}
        {error instanceof ApiError && error.status === 403 ? (
          <EmptyState
            icon={<ShieldAlert aria-hidden="true" />}
            title={t("notAssignedTitle")}
            description={t("notAssignedBody")}
            action={
              <Button asChild variant="secondary">
                <Link href="/dashboard">{t("backHome")}</Link>
              </Button>
            }
          />
        ) : (
          <QueryError retry={() => refetch()} error={error} />
        )}
      </AppPage>
    );
  }

  return (
    <AppPage
      {...page}
      toolbar={<RiskLevelSummary rows={rows} selected={level} onSelect={setLevel} />}
    >
      {canManage && policyOpen && <PolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} />}
      {computedAt && (
        <p className="text-caption font-normal text-fg-muted">
          {t("sortedHint")} ·{" "}
          {t("computedAt", {
            time: formatDateTime(computedAt, { locale, timeZone: me?.tenant.timezone }),
          })}
        </p>
      )}
      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/analytics/components/at-risk-students-view:2"
          mode="local"
          data={tableRows}
          columns={columns}
          rowCount={tableRows.length}
          pagination={{ pageIndex: 0, pageSize: 50 }}
          onPaginationChange={() => undefined}
          sorting={[]}
          onSortingChange={() => undefined}
          globalFilter={search}
          onGlobalFilterChange={setSearch}
          filters={filters}
          getRowId={(item) => item.student_user_id}
          onRowActivate={(item) => {
            router.push(studentRiskHref(item.student_user_id));
          }}
          fillHeight
          toolbarLabels={{ searchPlaceholder: t("searchPlaceholder") }}
          emptyState={
            filtering ? (
              <FilteredEmptyState
                onReset={() => {
                  setLevel("");
                  setClassId("");
                  setSearch("");
                }}
              />
            ) : (
              <EmptyState
                icon={<ShieldAlert aria-hidden="true" />}
                title={t("emptyTitle")}
                description={t("emptyBody")}
              />
            )
          }
        />
      </div>
    </AppPage>
  );
}
