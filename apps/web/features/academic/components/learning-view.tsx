"use client";

import { Button, SegmentedControl } from "@newsekolah/ui";
import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactElement, useState } from "react";

import { AppPage } from "../../../components/app-page";
import { PeriodsView } from "../../school/components/periods-view";
import { SubjectsView } from "../../school/components/subjects-view";

import type { HubPageProps } from "./hub-page";
import { LearningWorkspaceNav } from "./learning-workspace-nav";
import { SubjectOfferingsView } from "./subject-offerings-view";

/**
 * A section either renders the page itself from the hub's frame (`page`),
 * with its own add button as the header's primary action, or is still a
 * bare body the hub wraps in the page.
 */
type SectionView =
  | { kind: "page"; View: (props: { page: HubPageProps }) => ReactElement }
  | { kind: "body"; View: () => ReactElement };

const sections = [
  { value: "subjects", label: "subjects", section: { kind: "body", View: SubjectsView } },
  {
    value: "offerings",
    label: "offerings",
    section: { kind: "page", View: SubjectOfferingsView },
  },
  { value: "periods", label: "periods", section: { kind: "body", View: PeriodsView } },
] as const satisfies readonly { value: string; label: string; section: SectionView }[];

type Section = (typeof sections)[number]["value"];

/** The workspace strip owns the top-level choice; sibling sections switch in the toolbar. */
const sectionGroups: readonly (readonly Section[])[] = [["subjects", "offerings"], ["periods"]];

/**
 * Pembelajaran: subjects (and their offering per academic year) and the
 * lesson periods. The area's tabs sit under the header; the two views of
 * subjects are a segmented switch, all kept in `?tab=`. The hub owns that
 * frame and hands it to the active section (see HubPageProps).
 */
export function LearningView(): ReactElement {
  const t = useTranslations("app.academic.learning");
  const tSubjects = useTranslations("app.school.subjects");
  // "Tambah mapel" is the page header's primary action; the subjects list
  // only owns the dialog it opens.
  const [addingSubject, setAddingSubject] = useState(false);
  const router = useRouter();
  const requested = useSearchParams().get("tab");
  const active = sections.find((section) => section.value === requested) ?? sections[0];
  const siblings = sectionGroups.find((group) => group.includes(active.value)) ?? [active.value];

  const page: HubPageProps = {
    description: t("description"),
    nav: <LearningWorkspaceNav />,
    toolbar:
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
      ) : undefined,
  };

  if (active.section.kind === "page") {
    const PageSection = active.section.View;
    return <PageSection page={page} />;
  }
  if (active.value === "subjects") {
    return (
      <AppPage
        {...page}
        primaryAction={
          <Button
            icon={<Plus />}
            onClick={() => {
              setAddingSubject(true);
            }}
          >
            {tSubjects("add")}
          </Button>
        }
      >
        <SubjectsView adding={addingSubject} onAddingChange={setAddingSubject} />
      </AppPage>
    );
  }
  const BodySection = active.section.View;
  return (
    <AppPage {...page}>
      <BodySection />
    </AppPage>
  );
}
