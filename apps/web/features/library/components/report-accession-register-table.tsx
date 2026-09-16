"use client";

import { Skeleton } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useLibraryAccessionRegisterReportQuery } from "../reports-api";

import { LibraryTitleName } from "./library-title-name";

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
    <div className="overflow-x-auto rounded-sm border border-border bg-surface">
      <table className="w-full min-w-[560px] text-[13px]">
        <thead>
          <tr className="bg-bg text-left text-fg-muted">
            <th scope="col" className="px-3 py-2 font-medium">
              {t("columns.accessionNumber")}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t("columns.title")}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t("columns.barcode")}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t("columns.acquiredOn")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {copies.map((copy) => (
            <tr key={copy.id}>
              <td className="px-3 py-2 tabular-nums text-fg">{copy.accession_number}</td>
              <td className="px-3 py-2 text-fg">
                <LibraryTitleName titleId={copy.title_id} />
              </td>
              <td className="px-3 py-2 text-fg-muted">{copy.barcode}</td>
              <td className="px-3 py-2 text-fg-muted">{copy.acquired_on ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
