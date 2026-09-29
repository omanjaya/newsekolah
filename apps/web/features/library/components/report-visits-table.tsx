"use client";

import { formatDate } from "@newsekolah/i18n";
import type { Locale } from "@newsekolah/i18n";
import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@newsekolah/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useLibraryVisitsReportQuery } from "../reports-api";

/** Visits in the chosen period, broken down per day and per class. */
export function ReportVisitsTable({ from, to }: { from: string; to: string }): ReactElement {
  const t = useTranslations("app.library.reports.visits");
  const locale = useLocale() as Locale;
  const { data, isLoading } = useLibraryVisitsReportQuery(from, to);

  if (isLoading) return <Skeleton className="h-64 w-full" aria-busy="true" />;
  if (!data || data.total === 0) {
    return <p className="text-[13px] text-fg-muted">{t("emptyTitle")}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-[13px] text-fg-muted">{t("total", { count: data.total })}</p>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Table className="min-w-[280px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("columns.day")}</TableHead>
              <TableHead scope="col">{t("columns.count")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.per_day.map((row) => (
              <TableRow key={row.day}>
                <TableCell>{formatDate(row.day, { locale })}</TableCell>
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
