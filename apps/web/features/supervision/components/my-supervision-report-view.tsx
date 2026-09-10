"use client";

import { PageHeader, Select } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

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
      <label className="flex max-w-xs flex-col gap-1 text-[13px]">
        <span className="font-medium">{t("cycle")}</span>
        <Select
          options={cycleOptions}
          value={cycleId}
          onValueChange={setSelectedCycleId}
          placeholder={t("cyclePlaceholder")}
        />
      </label>

      {cycleId === "" ? (
        <p className="text-[13px] text-fg-muted">{t("noCycles")}</p>
      ) : me ? (
        <TeacherSupervisionReportView cycleId={cycleId} teacherId={me.id} hideHeader />
      ) : null}
    </div>
  );
}
