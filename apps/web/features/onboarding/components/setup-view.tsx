"use client";

import { HeroCard, Progress, Skeleton } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
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
  const ready = data?.ready_to_operate ?? false;
  const profile = <SchoolProfileSection />;

  return (
    <AppPage title={t("title")}>
      {checklist.isError && !data ? (
        <QueryError retry={() => void checklist.refetch()} error={checklist.error} />
      ) : checklist.isLoading || !data ? (
        <Skeleton className="h-40 w-full rounded-xl" aria-busy="true" />
      ) : (
        <ProgressSummary
          requiredDone={data.required_done}
          requiredTotal={data.required_total}
          readyToOperate={data.ready_to_operate}
          activeYearLabel={data.active_year_label}
        />
      )}

      {/* Until the school is ready the profile is the first step; after
          that the checklist leads and the profile waits below it. */}
      {!ready && profile}

      {data && !data.ready_to_operate && (
        <OnboardingWizard
          templateDone={data.steps.some((step) => step.key === "grade_levels" && step.done)}
        />
      )}

      {!checklist.isError && <ChecklistSection checklist={data} isLoading={checklist.isLoading} />}

      {ready && profile}
    </AppPage>
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
    <HeroCard
      role="status"
      className="animate-enter"
      tone={readyToOperate ? "accent-soft" : "neutral"}
      eyebrow={activeYearLabel ? t("activeYear", { label: activeYearLabel }) : undefined}
      title={t("stepsLabel", { done: requiredDone, total: requiredTotal })}
      meta={t(readyToOperate ? "ready" : "notReady")}
      chip={readyToOperate ? t("readyChip") : undefined}
    >
      <Progress
        variant="meter"
        value={requiredDone}
        max={Math.max(requiredTotal, 1)}
        label={t("meterLabel")}
        tone={readyToOperate ? "success" : "accent"}
      />
    </HeroCard>
  );
}
