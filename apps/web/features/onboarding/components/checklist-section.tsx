"use client";

import { Badge, Skeleton } from "@newsekolah/ui";
import { Check, Circle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import type { SetupChecklist, SetupStep } from "../api";

/**
 * Fixed display order and destination for each step, per the mapping in
 * the onboarding task brief. Steps the checklist API does not return are
 * simply skipped rather than causing a crash, so this stays resilient to
 * the API adding or removing a step key.
 */
const STEP_ORDER = [
  "profile",
  "academic_year",
  "grade_levels",
  "classes",
  "periods",
  "subjects",
  "teachers",
  "students",
  "enrollments",
  "teaching_assignments",
  "schedules",
  "duties",
] as const;

const STEP_HREF: Record<(typeof STEP_ORDER)[number], string> = {
  profile: "#school-profile",
  academic_year: "/school/classes",
  grade_levels: "/school/classes",
  classes: "/school/classes",
  periods: "/school/periods",
  subjects: "/school/subjects",
  teachers: "/school/users",
  students: "/school/users",
  enrollments: "/school/classes",
  teaching_assignments: "/school/classes",
  schedules: "/schedule",
  duties: "/school/duties",
};

/** The profile step's count is never shown: "1 profile" says nothing useful. */
const STEPS_WITHOUT_COUNT = new Set<string>(["profile"]);

export function ChecklistSection({
  checklist,
  isLoading,
}: {
  checklist: SetupChecklist | undefined;
  isLoading: boolean;
}): ReactElement {
  const t = useTranslations("app.onboarding.checklist");

  if (isLoading || !checklist) {
    return <Skeleton className="h-96 w-full" aria-busy="true" />;
  }

  const byKey = new Map(checklist.steps.map((step) => [step.key, step]));

  return (
    <section className="flex flex-col gap-3 rounded-sm border border-border bg-surface p-4">
      <h2 className="text-[16px] font-medium text-fg">{t("title")}</h2>
      <ul className="flex flex-col divide-y divide-border">
        {STEP_ORDER.map((key) => {
          const step = byKey.get(key);
          if (!step) return null;
          return <ChecklistRow key={key} step={step} href={STEP_HREF[key]} />;
        })}
      </ul>
    </section>
  );
}

function ChecklistRow({ step, href }: { step: SetupStep; href: string }): ReactElement {
  const t = useTranslations("app.onboarding.checklist");
  const tStep = useTranslations(`app.onboarding.steps.${step.key}`);
  const showCount = step.count > 0 && !STEPS_WITHOUT_COUNT.has(step.key);

  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="flex items-start gap-3">
        <span
          className={
            step.done
              ? "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-accent bg-accent text-accent-fg"
              : "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-fg-muted"
          }
        >
          {step.done ? (
            <Check className="size-3.5" aria-hidden="true" />
          ) : (
            <Circle className="size-2 fill-current" aria-hidden="true" />
          )}
        </span>
        <div className="flex flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-medium text-fg">{tStep("label")}</span>
            {!step.required && <Badge>{t("optional")}</Badge>}
          </div>
          <p className="text-[13px] text-fg-muted">{tStep("description")}</p>
          {showCount && (
            <p className="text-[13px] tabular-nums text-fg-muted">
              {tStep("count", { count: step.count })}
            </p>
          )}
        </div>
      </div>
      <Link
        href={href}
        className="shrink-0 whitespace-nowrap text-[13px] font-medium text-accent hover:underline"
      >
        {t("openStep")}
      </Link>
    </li>
  );
}
