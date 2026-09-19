"use client";

import { EmptyState, Skeleton, domainIcons } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useLibraryDdcClassesQuery } from "../master-data-api";

/** The ten top-level Dewey Decimal classes; read-only reference for cataloguing. */
export function DdcClassesTab(): ReactElement {
  const t = useTranslations("app.library.masterData.ddcClasses");
  const { data, isLoading } = useLibraryDdcClassesQuery();
  const items = data?.data ?? [];

  if (isLoading) return <Skeleton className="h-64 w-full" aria-busy="true" />;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<domainIcons.library aria-hidden="true" />}
        title={t("emptyTitle")}
        description={t("emptyBody")}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-sm border border-border bg-surface md:h-full md:min-h-0 md:overflow-y-auto">
      <table className="w-full min-w-[360px] text-[13px]">
        <thead>
          <tr className="bg-bg text-left text-fg-muted">
            <th scope="col" className="w-24 px-3 py-2 font-medium">
              {t("columns.code")}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t("columns.name")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => (
            <tr key={item.code}>
              <td className="px-3 py-2 font-medium tabular-nums text-fg">{item.code}</td>
              <td className="px-3 py-2 text-fg">{item.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
