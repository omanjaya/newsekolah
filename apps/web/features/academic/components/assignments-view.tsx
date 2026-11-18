"use client";

import { SegmentedControl } from "@newsekolah/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { useCan } from "../../../lib/session/session-provider";
import { DutiesView } from "../../school/components/duties-view";
import { DutyTypesPanel } from "../../school/components/duty-types-panel";

import { LearningWorkspaceNav } from "./learning-workspace-nav";
import { TeachingAssignmentsView } from "./teaching-assignments-view";

function DutyTypesView(): ReactElement {
  const canManage = useCan("manage_permissions");
  return <DutyTypesPanel canManage={canManage} />;
}

const sections = [
  { value: "teaching", label: "teaching", View: TeachingAssignmentsView },
  { value: "duties", label: "duties", View: DutiesView },
  { value: "types", label: "types", View: DutyTypesView },
] as const;

type Section = (typeof sections)[number]["value"];

/** The workspace strip owns the top-level choice; sibling sections switch in the toolbar. */
const sectionGroups: readonly (readonly Section[])[] = [["teaching"], ["duties", "types"]];

/**
 * Penugasan: who teaches what, and the additional duties with their
 * types. Same hub template as Pembelajaran: area tabs under the header,
 * sibling views as a segmented switch, all kept in `?tab=`.
 */
export function AssignmentsView(): ReactElement {
  const t = useTranslations("app.academic.assignments");
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
              router.push(`/school/assignments?tab=${value}`, { scroll: false });
            }}
          />
        ) : undefined
      }
    >
      <ActiveView />
    </AppPage>
  );
}
