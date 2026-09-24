"use client";

import { ApiError } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatDateTime } from "@newsekolah/i18n";
import { Alert, Avatar, Button, DataTable, EmptyState, PageHeader, Skeleton } from "@newsekolah/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useClassesQuery, useDirectoryQuery, useLookup } from "../../reference/api";
import { type StudentRisk, useAtRiskStudentsQuery } from "../api";

import { PolicyDialog } from "./policy-dialog";
import { RiskLevelBadge } from "./risk-level-badge";
import { RiskLevelSummary } from "./risk-level-summary";

/**
 * The early-warning list: who to check on, ranked by score. A homeroom
 * teacher's own class only, a counselor or school leadership sees every
 * class -- decided server-side (analytics service.resolveScope), not by
 * anything this screen chooses.
 */
export function AtRiskStudentsView(): ReactElement {
  const t = useTranslations("app.analytics.list");
  const canManage = useCan("manage_early_warning_rules");
  const [policyOpen, setPolicyOpen] = useState(false);
  const locale = useLocale() as Locale;
  const router = useRouter();
  const apiErrorMessage = useApiErrorMessage();

  const { data, isLoading, error } = useAtRiskStudentsQuery();
  const students = useDirectoryQuery("student");
  const studentMap = useLookup(students.data?.data);
  const classes = useClassesQuery();
  const classMap = useLookup(classes.data?.data);

  const levelLabel = useTranslations("app.analytics.level");

  const rows = useMemo(() => {
    const items = data?.data ?? [];
    return [...items].sort((a, b) => b.score - a.score);
  }, [data]);

  const columns = useMemo<ColumnDef<StudentRisk>[]>(
    () => [
      {
        id: "student",
        header: t("columns.student"),
        enableSorting: false,
        cell: ({ row }) => {
          const student = studentMap.get(row.original.student_user_id);
          return student ? (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar size="sm" name={student.name} />
              <span className="truncate">{student.name}</span>
            </div>
          ) : (
            t("unknownStudent")
          );
        },
      },
      {
        id: "class",
        header: t("columns.class"),
        enableSorting: false,
        cell: ({ row }) => classMap.get(row.original.class_id)?.name ?? "-",
      },
      {
        id: "level",
        header: t("columns.level"),
        enableSorting: false,
        cell: ({ row }) => (
          <RiskLevelBadge level={row.original.level} label={levelLabel(row.original.level)} />
        ),
      },
      { accessorKey: "score", header: t("columns.score"), enableSorting: false },
      {
        id: "computedAt",
        header: t("columns.computedAt"),
        enableSorting: false,
        cell: ({ row }) => formatDateTime(row.original.computed_at, { locale }),
      },
    ],
    [t, locale, studentMap, classMap, levelLabel],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    const message =
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN");
    return (
      <div className="p-4 md:p-6">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          actions={
            canManage && (
              <Button
                variant="secondary"
                onClick={() => {
                  setPolicyOpen(true);
                }}
              >
                {t("policy")}
              </Button>
            )
          }
        />
        {canManage && policyOpen && <PolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} />}
        <Alert variant="warning" title={message} className="mt-4" />
      </div>
    );
  }

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the table scrolls its rows internally while the
    // header and description stay put. See users-view.tsx for the pattern.
    <div className="flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          canManage && (
            <Button
              variant="secondary"
              onClick={() => {
                setPolicyOpen(true);
              }}
            >
              {t("policy")}
            </Button>
          )
        }
      />
      {canManage && policyOpen && <PolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} />}
      <p className="text-[13px] text-fg-muted">{t("description")}</p>
      <RiskLevelSummary rows={rows} />
      <div className="flex flex-col md:min-h-0 md:flex-1">
        <DataTable
          stateKey="features/analytics/components/at-risk-students-view:1"
          mode="local"
          data={rows}
          columns={columns}
          rowCount={rows.length}
          pagination={{ pageIndex: 0, pageSize: 50 }}
          onPaginationChange={() => undefined}
          sorting={[]}
          onSortingChange={() => undefined}
          globalFilter=""
          getRowId={(item) => item.student_user_id}
          onRowActivate={(item) => {
            router.push(`/analytics/${item.student_user_id}`);
          }}
          fillHeight
          emptyState={
            <EmptyState
              icon={<ShieldAlert aria-hidden="true" />}
              title={t("emptyTitle")}
              description={t("emptyBody")}
            />
          }
        />
      </div>
    </div>
  );
}
