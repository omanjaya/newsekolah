"use client";

import { EmptyState, PageHeader, Skeleton, cn } from "@newsekolah/ui";
import { ChevronDown, FileSpreadsheet } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useReportsQuery } from "../api";

import { ReportArgsForm } from "./report-args-form";

/**
 * Report centre: one catalogue of exports, filtered server-side to what the
 * caller may run. Picking a report expands its argument controls in place
 * rather than routing to a separate page, since most reports need only one
 * or two inputs before the download is ready.
 */
export function ReportsView(): ReactElement {
  const t = useTranslations("app.reports");
  const [selectedKind, setSelectedKind] = useState<string | null>(null);
  const reports = useReportsQuery();

  const items = reports.data?.data ?? [];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <p className="text-[13px] text-fg-muted">{t("description")}</p>

      {reports.isLoading ? (
        <Skeleton className="h-64 w-full" aria-busy="true" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FileSpreadsheet aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((report) => {
            const isSelected = selectedKind === report.kind;
            // Report kinds are dotted slugs ("attendance.daily"), but a
            // next-intl key cannot contain a dot: it is the namespace
            // separator. The catalog uses underscores instead.
            const kindKey = report.kind.replaceAll(".", "_");
            const label = t.has(`kinds.${kindKey}.label`)
              ? t(`kinds.${kindKey}.label`)
              : report.kind;
            const description = t.has(`kinds.${kindKey}.description`)
              ? t(`kinds.${kindKey}.description`)
              : undefined;
            return (
              <li key={report.kind} className="rounded-sm border border-border bg-surface">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 p-4 text-left"
                  aria-expanded={isSelected}
                  onClick={() => {
                    setSelectedKind(isSelected ? null : report.kind);
                  }}
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-[14px] font-medium text-fg">{label}</span>
                    {description && (
                      <span className="text-[13px] text-fg-muted">{description}</span>
                    )}
                  </div>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-fg-muted transition-transform duration-[var(--duration-fast)]",
                      isSelected && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </button>
                {isSelected && (
                  <div className="border-t border-border p-4">
                    <ReportArgsForm key={report.kind} report={report} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
