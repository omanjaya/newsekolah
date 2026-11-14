"use client";

import { SegmentedControl } from "@newsekolah/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { PeriodsView } from "../../school/components/periods-view";
import { SubjectsView } from "../../school/components/subjects-view";

import { LearningWorkspaceNav } from "./learning-workspace-nav";
import { SubjectOfferingsView } from "./subject-offerings-view";

const sections = [
  { value: "subjects", label: "subjects", View: SubjectsView },
  { value: "offerings", label: "offerings", View: SubjectOfferingsView },
  { value: "periods", label: "periods", View: PeriodsView },
] as const;

type Section = (typeof sections)[number]["value"];

/** The workspace strip owns the top-level choice; sibling sections switch in the toolbar. */
const sectionGroups: readonly (readonly Section[])[] = [["subjects", "offerings"], ["periods"]];

/**
 * Pembelajaran: subjects (and their offering per academic year) and the
 * lesson periods. The area's tabs sit under the header; the two views of
 * subjects are a segmented switch, all kept in `?tab=`.
 */
export function LearningView(): ReactElement {
  const t = useTranslations("app.academic.learning");
  const router = useRouter();
  const requested = useSearchParams().get("tab");
  const active = sections.find((section) => section.value === requested) ?? sections[0];
  const siblings = sectionGroups.find((group) => group.includes(active.value)) ?? [active.value];
  const ActiveView = active.View;

  return (
    <AppPage
      description={t("description")}
      nav={<LearningWorkspaceNav />}
      toolbar={
        siblings.length > 1 ? (
          <SegmentedControl
            aria-label={t("title")}
            options={sections
              .filter(({ value }) => siblings.includes(value))
              .map(({ value, label }) => ({ value, label: t(label) }))}
            value={active.value}
            onValueChange={(value) => {
              router.push(`/school/learning?tab=${value}`, { scroll: false });
            }}
          />
        ) : undefined
      }
    >
      <ActiveView />
    </AppPage>
  );
}
