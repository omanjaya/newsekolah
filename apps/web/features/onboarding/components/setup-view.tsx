"use client";

import { PageHeader, Skeleton } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { useSetupChecklistQuery } from "../api";

import { ChecklistSection } from "./checklist-section";
import { OnboardingWizard } from "./onboarding-wizard";
import { SchoolProfileSection } from "./school-profile-form";

/**
 * Onboarding checklist screen (docs/07-ui-ux.md section 4, "onboarding
 * sekolah"): the school profile form is the first step inline on this page,
 * the rest of the steps link out to the master-data screens where they are
 * actually done.
 */
export function SetupView(): ReactElement {
  const t = useTranslations("app.onboarding");
  const checklist = useSetupChecklistQuery();
  const data = checklist.data;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      {checklist.isError && !data ? (
        <QueryError retry={() => checklist.refetch()} />
      ) : checklist.isLoading || !data ? (
        <Skeleton className="h-16 w-full" aria-busy="true" />
      ) : (
        <ProgressSummary
          requiredDone={data.required_done}
          requiredTotal={data.required_total}
          readyToOperate={data.ready_to_operate}
          activeYearLabel={data.active_year_label}
        />
      )}

      <SchoolProfileSection />

      {data && !data.ready_to_operate && <OnboardingWizard />}

      {!checklist.isError && <ChecklistSection checklist={data} isLoading={checklist.isLoading} />}
    </div>
  );
}

function ProgressSummary({
  requiredDone,
  requiredTotal,
  readyToOperate,
  activeYearLabel,
}: {
  requiredDone: number;
  requiredTotal: number;
  readyToOperate: boolean;
  activeYearLabel?: string;
}): ReactElement {
  const t = useTranslations("app.onboarding.progress");

  return (
    <section
      className="flex flex-col gap-1 rounded-sm border border-border bg-surface p-4"
      role="status"
    >
      <p className="text-[14px] font-medium tabular-nums text-fg">
        {t("stepsLabel", { done: requiredDone, total: requiredTotal })}
      </p>
      <p className="text-[13px] text-fg-muted">{t(readyToOperate ? "ready" : "notReady")}</p>
      {activeYearLabel && (
        <p className="text-[13px] text-fg-muted">{t("activeYear", { label: activeYearLabel })}</p>
      )}
    </section>
  );
}
