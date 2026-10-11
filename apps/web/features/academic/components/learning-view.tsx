"use client";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { PeriodsView } from "../../school/components/periods-view";
import { SubjectsView } from "../../school/components/subjects-view";

import { LearningWorkspaceNav } from "./learning-workspace-nav";
import { SubjectOfferingsView } from "./subject-offerings-view";

const sections = [
  { value: "subjects", label: "subjects", View: SubjectsView },
  { value: "offerings", label: "offerings", View: SubjectOfferingsView },
  { value: "periods", label: "periods", View: PeriodsView },
] as const;

/** The workspace strip owns the top-level choice; only sibling sections stay as inner tabs. */
const sectionGroups: readonly (readonly string[])[] = [["subjects", "offerings"], ["periods"]];

export function LearningView(): ReactElement {
  const t = useTranslations("app.academic.learning");
  const tNav = useTranslations("app.navigation");
  const tWorkspace = useTranslations("app.workspace");
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const active = sections.find((section) => section.value === requested)?.value ?? "subjects";

  const siblings = sectionGroups.find((group) => group.includes(active)) ?? [active];

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the active tab's panel scrolls internally.
    <div className="flex min-w-0 flex-col gap-4 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
      <LearningWorkspaceNav />
      <PageHeader eyebrow={tNav("masterData")} title={tWorkspace("learning")} />
      <p className="text-[13px] text-fg-muted">{t("description")}</p>
      <Tabs
        value={active}
        onValueChange={(value) => {
          router.push(`/school/learning?tab=${value}`, { scroll: false });
        }}
        className="flex flex-col md:min-h-0 md:flex-1"
      >
        {siblings.length > 1 && (
          <TabsList aria-label={t("title")} className="flex-wrap">
            {sections
              .filter(({ value }) => siblings.includes(value))
              .map(({ value, label }) => (
                <TabsTrigger key={value} value={value}>
                  {t(label)}
                </TabsTrigger>
              ))}
          </TabsList>
        )}
        {sections.map(({ value, View }) => (
          <TabsContent key={value} value={value} className="md:min-h-0 md:flex-1">
            <View />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
