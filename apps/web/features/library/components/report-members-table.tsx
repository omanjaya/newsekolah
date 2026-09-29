"use client";

import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useLibraryMembersReportQuery } from "../reports-api";

/** Members counted by type and by class, plus the active/total split. */
export function ReportMembersTable(): ReactElement {
  const t = useTranslations("app.library.reports.members");
  const { data, isLoading } = useLibraryMembersReportQuery();

  if (isLoading) return <Skeleton className="h-64 w-full" aria-busy="true" />;
  if (!data || data.total === 0) {
    return <p className="text-[13px] text-fg-muted">{t("emptyTitle")}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex flex-col">
          <dt className="text-[12px] text-fg-muted">{t("total")}</dt>
          <dd className="text-[18px] font-medium tabular-nums text-fg">{data.total}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-[12px] text-fg-muted">{t("active")}</dt>
          <dd className="text-[18px] font-medium tabular-nums text-fg">{data.active}</dd>
        </div>
      </dl>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Table className="min-w-[280px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("columns.type")}</TableHead>
              <TableHead scope="col">{t("columns.count")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.per_type.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.name}</TableCell>
                <TableCell className="tabular-nums text-fg-muted">{row.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Table className="min-w-[280px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("columns.class")}</TableHead>
              <TableHead scope="col">{t("columns.count")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.per_class.map((row) => (
              <TableRow key={row.class_name}>
                <TableCell>{row.class_name}</TableCell>
                <TableCell className="tabular-nums text-fg-muted">{row.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
