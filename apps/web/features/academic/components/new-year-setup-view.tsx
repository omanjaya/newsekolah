"use client";

import { ApiError } from "@newsekolah/api-client";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Select,
  Skeleton,
  useToast,
} from "@newsekolah/ui";
import { CalendarPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useApiErrorMessage } from "../../../lib/i18n/api-error-message";
import { useLookup, useSubjectsQuery } from "../../reference/api";
import { useAcademicYearsQuery } from "../api";
import {
  type NewYearSetupPlan,
  useCommitNewYearSetupMutation,
  usePreviewNewYearSetupMutation,
} from "../api-enrollment";
import { useGradeLevelsQuery } from "../api-master-data";

/**
 * Copies subject offerings and classes from one academic year into another
 * that does not have them yet -- the usual first step when opening a new
 * school year. Nothing is written until the plan is reviewed and confirmed.
 */
export function NewYearSetupView(): ReactElement {
  const t = useTranslations("app.academic.newYearSetup");
  const toast = useToast();
  const apiErrorMessage = useApiErrorMessage();

  const years = useAcademicYearsQuery();
  const yearOptions = years.data?.data ?? [];
  const subjects = useSubjectsQuery();
  const subjectMap = useLookup(subjects.data?.data);
  const gradeLevels = useGradeLevelsQuery();
  const gradeLevelMap = useLookup(gradeLevels.data?.data);

  const [fromYearId, setFromYearId] = useState("");
  const [toYearId, setToYearId] = useState("");
  const [plan, setPlan] = useState<NewYearSetupPlan | null>(null);
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
      { onSuccess: setPlan, onError: fail },
    );
  }

  const newOfferings = (plan?.subject_offerings ?? []).filter((o) => !o.already_exists);
  const newClasses = (plan?.classes ?? []).filter((c) => !c.already_exists);
  const hasNothingToCopy = plan !== null && newOfferings.length === 0 && newClasses.length === 0;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <p className="text-[13px] text-fg-muted">{t("description")}</p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("fromYear")}</span>
          <Select
            options={yearOptions.map((y) => ({ value: y.id, label: y.label }))}
            value={fromYearId}
            onValueChange={setFromYearId}
            className="w-56"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium">{t("toYear")}</span>
          <Select
            options={yearOptions.map((y) => ({ value: y.id, label: y.label }))}
            value={toYearId}
            onValueChange={setToYearId}
            className="w-56"
          />
        </label>
        <Button
          onClick={runPreview}
          loading={preview.isPending}
          disabled={!fromYearId || !toYearId || fromYearId === toYearId}
        >
          {t("preview")}
        </Button>
      </div>

      {fromYearId && fromYearId === toYearId && (
        <p className="text-[13px] text-status-absent">{t("sameYearError")}</p>
      )}

      {preview.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : plan && hasNothingToCopy ? (
        <EmptyState
          icon={<CalendarPlus aria-hidden="true" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        plan && (
          <>
            <section className="flex flex-col gap-2">
              <h2 className="text-[16px] font-medium text-fg">
                {t("offeringsTitle", { n: newOfferings.length })}
              </h2>
              <ul className="divide-y divide-border rounded-xs border border-border text-[13px]">
                {plan.subject_offerings.map((offering, i) => (
                  <li
                    key={`${offering.subject_id}-${offering.grade_level_id ?? "all"}-${i}`}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <span>
                      {subjectMap.get(offering.subject_id)?.name ?? offering.subject_id}
                      {offering.grade_level_id && (
                        <span className="text-fg-muted">
                          {" "}
                          · {gradeLevelMap.get(offering.grade_level_id)?.name ?? "-"}
                        </span>
                      )}
                    </span>
                    <Badge variant={offering.already_exists ? "neutral" : "accent"}>
                      {offering.already_exists ? t("alreadyExists") : t("willCopy")}
                    </Badge>
                  </li>
                ))}
                {plan.subject_offerings.length === 0 && (
                  <li className="px-3 py-4 text-center text-fg-muted">{t("noOfferings")}</li>
                )}
              </ul>
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="text-[16px] font-medium text-fg">
                {t("classesTitle", { n: newClasses.length })}
              </h2>
              <ul className="divide-y divide-border rounded-xs border border-border text-[13px]">
                {plan.classes.map((cls, i) => (
                  <li
                    key={`${cls.name}-${i}`}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <span>{cls.name}</span>
                    <Badge variant={cls.already_exists ? "neutral" : "accent"}>
                      {cls.already_exists ? t("alreadyExists") : t("willCopy")}
                    </Badge>
                  </li>
                ))}
                {plan.classes.length === 0 && (
                  <li className="px-3 py-4 text-center text-fg-muted">{t("noClasses")}</li>
                )}
              </ul>
            </section>

            <div className="flex justify-end border-t border-border pt-4">
              <Button
                onClick={() => {
                  setConfirming(true);
                }}
                disabled={hasNothingToCopy}
              >
                {t("commit")}
              </Button>
            </div>
          </>
        )
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("confirmTitle")}
        description={t("confirmBody", {
          offerings: newOfferings.length,
          classes: newClasses.length,
        })}
        confirming={commit.isPending}
        onConfirm={async () => {
          try {
            const result = await commit.mutateAsync({
              from_year_id: fromYearId,
              to_year_id: toYearId,
            });
            setPlan(null);
            setConfirming(false);
            toast.success(
              t("committed", {
                offerings: result.subject_offerings_copied,
                classes: result.classes_copied,
              }),
            );
          } catch (error) {
            fail(error);
          }
        }}
      />
    </div>
  );
}
