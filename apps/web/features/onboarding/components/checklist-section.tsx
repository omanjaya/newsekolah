"use client";

import {
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  IconCircle,
  List,
  ListRow,
  SkeletonList,
} from "@newsekolah/ui";
import { Check, Circle } from "lucide-react";
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
  academic_year: "/academic/years",
  grade_levels: "/school/structure?tab=grade-levels",
  classes: "/school/classes",
  periods: "/school/learning?tab=periods",
  subjects: "/school/learning?tab=subjects",
  teachers: "/school/users?kind=teacher",
  students: "/school/users?kind=student",
  enrollments: "/school/classes",
  teaching_assignments: "/school/assignments?tab=teaching",
  schedules: "/schedule",
  duties: "/school/assignments?tab=duties",
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
    return <SkeletonList rows={6} leading framed />;
  }

  const byKey = new Map(checklist.steps.map((step) => [step.key, step]));
  const steps = STEP_ORDER.map((key) => byKey.get(key)).filter(
    (step): step is SetupStep => step !== undefined,
  );
  // What is left to do comes first; done steps keep their order below it.
  const ordered = [...steps.filter((step) => !step.done), ...steps.filter((step) => step.done)];
  const left = steps.filter((step) => !step.done).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("title")}</CardTitle>
        <CardDescription>{left > 0 ? t("left", { n: left }) : t("allDone")}</CardDescription>
      </CardHeader>
      <List variant="inset">
        {ordered.map((step) => (
          <ChecklistRow
            key={step.key}
            step={step}
            href={STEP_HREF[step.key as (typeof STEP_ORDER)[number]]}
          />
        ))}
      </List>
    </Card>
  );
}

function ChecklistRow({ step, href }: { step: SetupStep; href: string }): ReactElement {
  const t = useTranslations("app.onboarding.checklist");
  const tStep = useTranslations(`app.onboarding.steps.${step.key}`);
  const showCount = step.count > 0 && !STEPS_WITHOUT_COUNT.has(step.key);

  return (
    <ListRow
      href={href}
      leading={
        <IconCircle size="sm" tone={step.done ? "accent" : "neutral"}>
          {step.done ? <Check /> : <Circle className="fill-current [&]:size-2" />}
        </IconCircle>
      }
      title={
        <span className="flex flex-wrap items-center gap-2">
          {tStep("label")}
          {!step.required && <Badge tone="neutral">{t("optional")}</Badge>}
        </span>
      }
      // The count sits at the row's end, where the meta's two-line clamp
      // cannot cut it off on a phone.
      meta={tStep("description")}
      trailing={
        showCount || step.done ? (
          <>
            {showCount && (
              <span className="text-body-sm">{tStep("count", { count: step.count })}</span>
            )}
            {step.done && <span className="sr-only">{t("done")}</span>}
          </>
        ) : undefined
      }
    />
  );
}
