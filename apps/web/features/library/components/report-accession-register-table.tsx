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

import { useLibraryAccessionRegisterReportQuery } from "../reports-api";

import { LibraryTitleName } from "./library-title-name";
import { ReportCard, ReportCardTitle, ReportField } from "./report-mobile-card";

/** Copies acquired in the period, in acquisition order (Buku Induk). */
export function ReportAccessionRegisterTable({
  from,
  to,
}: {
  from: string;
  to: string;
}): ReactElement {
  const t = useTranslations("app.library.reports.accessionRegister");
  const { data, isLoading } = useLibraryAccessionRegisterReportQuery(from, to);
  const copies = data?.data ?? [];

  if (isLoading) return <Skeleton className="h-64 w-full" aria-busy="true" />;
  if (copies.length === 0) {
    return <p className="text-[13px] text-fg-muted">{t("emptyTitle")}</p>;
  }

  return (
    <>
      <ul className="flex flex-col gap-2 md:hidden">
        {copies.map((copy) => (
          <li key={copy.id}>
            <ReportCard>
              <ReportCardTitle>
                <LibraryTitleName titleId={copy.title_id} />
              </ReportCardTitle>
              <ReportField
                label={t("columns.accessionNumber")}
                value={<span className="tabular-nums">{copy.accession_number}</span>}
              />
              <ReportField label={t("columns.barcode")} value={copy.barcode} />
              <ReportField label={t("columns.acquiredOn")} value={copy.acquired_on ?? "-"} />
            </ReportCard>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("columns.accessionNumber")}</TableHead>
              <TableHead scope="col">{t("columns.title")}</TableHead>
              <TableHead scope="col">{t("columns.barcode")}</TableHead>
              <TableHead scope="col">{t("columns.acquiredOn")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {copies.map((copy) => (
              <TableRow key={copy.id}>
                <TableCell className="tabular-nums">{copy.accession_number}</TableCell>
                <TableCell>
                  <LibraryTitleName titleId={copy.title_id} />
                </TableCell>
                <TableCell className="text-fg-muted">{copy.barcode}</TableCell>
                <TableCell className="text-fg-muted">{copy.acquired_on ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
