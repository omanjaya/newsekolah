"use client";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { PeriodsView } from "../../school/components/periods-view";
import { SubjectsView } from "../../school/components/subjects-view";

import { SubjectOfferingsView } from "./subject-offerings-view";

const sections = [
  { value: "subjects", label: "subjects", View: SubjectsView },
  { value: "offerings", label: "offerings", View: SubjectOfferingsView },
  { value: "periods", label: "periods", View: PeriodsView },
] as const;

export function LearningView(): ReactElement {
  const t = useTranslations("app.academic.learning");
  const tNav = useTranslations("app.navigation");
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const active = sections.find((section) => section.value === requested)?.value ?? "subjects";

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <PageHeader eyebrow={tNav("masterData")} title={t("title")} />
      <p className="text-[13px] text-fg-muted">{t("description")}</p>
      <Tabs
        value={active}
        onValueChange={(value) => {
          router.push(`/school/learning?tab=${value}`, { scroll: false });
        }}
      >
        <TabsList aria-label={t("title")} className="flex-wrap">
          {sections.map(({ value, label }) => (
            <TabsTrigger key={value} value={value}>
              {t(label)}
            </TabsTrigger>
          ))}
        </TabsList>
        {sections.map(({ value, View }) => (
          <TabsContent key={value} value={value}>
            <View />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
