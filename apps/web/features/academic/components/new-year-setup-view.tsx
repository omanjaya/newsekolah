"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  HeroCard,
  List,
  ListRow,
  SkeletonList,
  Stat,
  StatGrid,
  useToast,
} from "@newsekolah/ui";
import { BookOpen, CalendarPlus, School } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useCan } from "../../../lib/session/session-provider";
import { useLookup, useSubjectsQuery } from "../../reference/api";
import { useAcademicYearsQuery } from "../api";
import {
  type NewYearSetupPlan,
  useCommitNewYearSetupMutation,
  usePreviewNewYearSetupMutation,
} from "../api-enrollment";
import { useGradeLevelsQuery } from "../api-master-data";

import { AcademicWorkspaceLinks } from "./academic-workspace-links";
import { WizardProgress, YearPairStep, useYearPair } from "./year-pair-step";

interface Done {
  from: string;
  to: string;
  offerings: number;
  classes: number;
}

/**
 * Copies subject offerings and classes from one academic year into another
 * that does not have them yet -- the usual first step when opening a new
 * school year. A wizard: choose the years, review what would be copied,
 * then a result report that stays until the years change. Nothing is
 * written until the plan is reviewed and confirmed.
 */
export function NewYearSetupView(): ReactElement {
  const canPromote = useCan("manage_enrollments");
  const tWorkspace = useTranslations("app.academic.workspace");
  const t = useTranslations("app.academic.newYearSetup");
  const tFlow = useTranslations("app.academic.yearFlow");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const years = useAcademicYearsQuery();
  const yearOptions = years.data?.data ?? [];
  const subjects = useSubjectsQuery();
  const subjectMap = useLookup(subjects.data?.data);
  const gradeLevels = useGradeLevelsQuery();
  const gradeLevelMap = useLookup(gradeLevels.data?.data);
  const { fromYearId, toYearId, setFromYearId, setToYearId } = useYearPair(yearOptions);
  const yearLabel = (id: string) => yearOptions.find((year) => year.id === id)?.label ?? "";

  const [previewResult, setPreviewResult] = useState<{
    from: string;
    to: string;
    plan: NewYearSetupPlan;
  } | null>(null);
  const plan =
    previewResult !== null && previewResult.from === fromYearId && previewResult.to === toYearId
      ? previewResult.plan
      : null;
  const [done, setDone] = useState<Done | null>(null);
  const result = done !== null && done.from === fromYearId && done.to === toYearId ? done : null;
  const [confirming, setConfirming] = useState(false);

  const preview = usePreviewNewYearSetupMutation();
  const commit = useCommitNewYearSetupMutation();

  const fail = (error: unknown) => {
    toast.error(
      error instanceof ApiError ? apiErrorMessage(error.code) : apiErrorMessage("UNKNOWN"),
    );
  };

  function runPreview() {
    if (!fromYearId || !toYearId) return;
    preview.mutate(
      { from_year_id: fromYearId, to_year_id: toYearId },
      {
        onSuccess: (response) => {
          setPreviewResult({ from: fromYearId, to: toYearId, plan: response });
        },
        onError: fail,
      },
    );
  }

  const newOfferings = (plan?.subject_offerings ?? []).filter((o) => !o.already_exists);
  const newClasses = (plan?.classes ?? []).filter((c) => !c.already_exists);
  const hasNothingToCopy = plan !== null && newOfferings.length === 0 && newClasses.length === 0;
  const step = result ? 2 : plan ? 1 : 0;

  return (
    // The area's header (Tahun ajaran) over its tabs, as on every sibling;
    // what this flow does heads its first card.
    <AppPage nav={<AcademicWorkspaceLinks area="years" />}>
      <WizardProgress
        current={step}
        labels={[tFlow("stepYears"), tFlow("stepReview"), tFlow("stepDone")]}
      />

      {result ? (
        <HeroCard
          tone="accent-soft"
          eyebrow={tFlow("doneEyebrow")}
          title={t("doneTitle", { year: yearLabel(result.to) })}
          meta={t("committed", { offerings: result.offerings, classes: result.classes })}
          action={
            canPromote ? (
              <Button asChild>
                <Link
                  href={`/school/promotion?${new URLSearchParams({ fromYear: result.from, toYear: result.to }).toString()}`}
                >
                  {tWorkspace("continuePromotion")}
                </Link>
              </Button>
            ) : undefined
          }
          secondaryAction={
            <Button
              variant="secondary"
              onClick={() => {
                setDone(null);
              }}
            >
              {tFlow("startOver")}
            </Button>
          }
        />
      ) : (
        <YearPairStep
          years={yearOptions}
          fromYearId={fromYearId}
          toYearId={toYearId}
          onFromChange={setFromYearId}
          onToChange={setToYearId}
          onPreview={runPreview}
          previewing={preview.isPending}
          previewLabel={plan ? tFlow("previewAgain") : t("preview")}
          title={t("idleTitle")}
          description={t("description")}
        />
      )}

      {/* Nothing under the year step until a plan exists: the stepper and
          the step's own card already say what to do. */}
      {result ? null : preview.isPending ? (
        <SkeletonList rows={5} framed />
      ) : plan === null ? null : hasNothingToCopy ? (
        <EmptyState
          icon={<CalendarPlus aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <>
          <StatGrid variant="strip" aria-label={tFlow("summary")}>
            <Stat
              icon={<BookOpen />}
              tone="blue"
              label={t("offeringsLabel")}
              value={newOfferings.length}
              hint={t("ofTotal", { n: plan.subject_offerings.length })}
            />
            <Stat
              icon={<School />}
              tone="green"
              label={t("classesLabel")}
              value={newClasses.length}
              hint={t("ofTotal", { n: plan.classes.length })}
            />
          </StatGrid>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle as="h2">{t("offeringsTitle", { n: newOfferings.length })}</CardTitle>
              </CardHeader>
              {plan.subject_offerings.length === 0 ? (
                <p className="px-5 pb-5 text-body-sm text-fg-muted">{t("noOfferings")}</p>
              ) : (
                <List dense className="max-h-96 overflow-y-auto">
                  {plan.subject_offerings.map((offering, i) => (
                    <ListRow
                      key={`${offering.subject_id}-${offering.grade_level_id ?? "all"}-${i}`}
                      title={subjectMap.get(offering.subject_id)?.name ?? offering.subject_id}
                      meta={
                        offering.grade_level_id
                          ? gradeLevelMap.get(offering.grade_level_id)?.name
                          : undefined
                      }
                      trailing={<CopyBadge exists={offering.already_exists} />}
                    />
                  ))}
                </List>
              )}
            </Card>
            <Card>
              <CardHeader>
                <CardTitle as="h2">{t("classesTitle", { n: newClasses.length })}</CardTitle>
              </CardHeader>
              {plan.classes.length === 0 ? (
                <p className="px-5 pb-5 text-body-sm text-fg-muted">{t("noClasses")}</p>
              ) : (
                <List dense className="max-h-96 overflow-y-auto">
                  {plan.classes.map((cls, i) => (
                    <ListRow
                      key={`${cls.name}-${i}`}
                      title={cls.name}
                      trailing={<CopyBadge exists={cls.already_exists} />}
                    />
                  ))}
                </List>
              )}
            </Card>
          </div>
          <div className="flex justify-end">
            <Button
              className="max-sm:w-full"
              onClick={() => {
                setConfirming(true);
              }}
            >
              {t("commit")}
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirming && plan !== null}
        onOpenChange={setConfirming}
        title={t("confirmTitle", { year: yearLabel(toYearId) })}
        description={t("confirmBody", {
          offerings: newOfferings.length,
          classes: newClasses.length,
        })}
        confirmLabel={t("commit")}
        confirming={commit.isPending}
        onConfirm={async () => {
          if (!plan) return;
          try {
            const response = await commit.mutateAsync({
              from_year_id: fromYearId,
              to_year_id: toYearId,
            });
            setPreviewResult(null);
            setDone({
              from: fromYearId,
              to: toYearId,
              offerings: response.subject_offerings_copied,
              classes: response.classes_copied,
            });
            setConfirming(false);
            toast.success(
              t("committed", {
                offerings: response.subject_offerings_copied,
                classes: response.classes_copied,
              }),
            );
          } catch (error) {
            fail(error);
          }
        }}
      />
    </AppPage>
  );
}

function CopyBadge({ exists }: { exists: boolean }): ReactElement {
  const t = useTranslations("app.academic.newYearSetup");
  return exists ? (
    <Badge tone="neutral">{t("alreadyExists")}</Badge>
  ) : (
    <Badge tone="success" dot>
      {t("willCopy")}
    </Badge>
  );
}
