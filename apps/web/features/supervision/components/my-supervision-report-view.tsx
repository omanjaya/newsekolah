"use client";

import { EmptyState, PageHeader, Select, Skeleton, domainIcons } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useSession } from "../../../lib/session/session-provider";
import { useSupervisionCyclesQuery } from "../api";

import { TeacherSupervisionReportView } from "./teacher-supervision-report-view";

/** The signed-in teacher's own supervision report, one cycle at a time. */
export function MySupervisionReportView(): ReactElement {
  const t = useTranslations("app.supervision.myReport");
  const { me } = useSession();
  const cycles = useSupervisionCyclesQuery();

  // `undefined` defers to the first cycle in the list until the reader picks one.
  const [selectedCycleId, setSelectedCycleId] = useState<string | undefined>(undefined);
  const cycleId = selectedCycleId ?? cycles.data?.data[0]?.id ?? "";
  const cycleOptions = (cycles.data?.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      {cycles.isLoading ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-10 w-full max-w-xs" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : cycles.isError ? (
        <QueryError retry={cycles.refetch} />
      ) : cycleId === "" ? (
        <EmptyState
          icon={<domainIcons.supervision aria-hidden="true" />}
          title={t("noCyclesTitle")}
          description={t("noCyclesBody")}
        />
      ) : (
        me && (
          <TeacherSupervisionReportView
            cycleId={cycleId}
            teacherId={me.id}
            hideHeader
            toolbar={
              <label className="flex w-full max-w-xs flex-col gap-1 text-[13px]">
                <span className="font-medium">{t("cycle")}</span>
                <Select
                  options={cycleOptions}
                  value={cycleId}
                  onValueChange={setSelectedCycleId}
                  placeholder={t("cyclePlaceholder")}
                />
              </label>
            }
          />
        )
      )}
    </div>
  );
}
