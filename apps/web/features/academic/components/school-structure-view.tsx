"use client";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { GradeLevelsView } from "./grade-levels-view";
import { RoomsView } from "./rooms-view";
import { TracksView } from "./tracks-view";

const sections = [
  { value: "grade-levels", label: "gradeLevels", View: GradeLevelsView },
  { value: "tracks", label: "tracks", View: TracksView },
  { value: "rooms", label: "rooms", View: RoomsView },
] as const;

export function SchoolStructureView(): ReactElement {
  const t = useTranslations("app.academic.structure");
  const tNav = useTranslations("app.navigation");
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const active = sections.find((section) => section.value === requested)?.value ?? "grade-levels";

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <PageHeader eyebrow={tNav("masterData")} title={t("title")} />
      <p className="text-[13px] text-fg-muted">{t("description")}</p>
      <Tabs
        value={active}
        onValueChange={(value) => {
          router.push(`/school/structure?tab=${value}`, { scroll: false });
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
