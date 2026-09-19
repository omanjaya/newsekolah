"use client";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useCan } from "../../../lib/session/session-provider";
import { DutiesView } from "../../school/components/duties-view";
import { DutyTypesPanel } from "../../school/components/duty-types-panel";

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

export function AssignmentsView(): ReactElement {
  const t = useTranslations("app.academic.assignments");
  const tNav = useTranslations("app.navigation");
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const active = sections.find((section) => section.value === requested)?.value ?? "teaching";

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <PageHeader eyebrow={tNav("masterData")} title={t("title")} />
      <p className="text-[13px] text-fg-muted">{t("description")}</p>
      <Tabs
        value={active}
        onValueChange={(value) => {
          router.push(`/school/assignments?tab=${value}`, { scroll: false });
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
