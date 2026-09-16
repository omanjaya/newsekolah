"use client";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { AtRiskPanel } from "./at-risk-panel";
import { IssuedLettersPanel } from "./issued-letters-panel";
import { WarningLetterTemplateView } from "./warning-letter-template-view";

export function WarningLettersView(): ReactElement {
  const t = useTranslations("app.discipline.warningLetters");
  const [tab, setTab] = useState("issued");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="issued">{t("tabs.issued")}</TabsTrigger>
          <TabsTrigger value="atRisk">{t("tabs.atRisk")}</TabsTrigger>
          <TabsTrigger value="template">{t("tabs.template")}</TabsTrigger>
        </TabsList>
        <TabsContent value="issued" className="pt-4">
          <IssuedLettersPanel />
        </TabsContent>
        <TabsContent value="atRisk" className="pt-4">
          <AtRiskPanel />
        </TabsContent>
        <TabsContent value="template" className="pt-4">
          <WarningLetterTemplateView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
