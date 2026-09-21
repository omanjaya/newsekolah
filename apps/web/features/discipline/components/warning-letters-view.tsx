"use client";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";

import { AtRiskPanel } from "./at-risk-panel";
import { IssuedLettersPanel } from "./issued-letters-panel";
import { WarningLetterTemplateView } from "./warning-letter-template-view";

export function WarningLettersView(): ReactElement {
  const t = useTranslations("app.discipline.warningLetters");
  const [tab, setTab] = useUrlState<string>("tab", ["issued", "atRisk", "template"], "issued");

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the active tab's panel scrolls internally.
    <div className="flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <Tabs value={tab} onValueChange={setTab} className="flex flex-col md:min-h-0 md:flex-1">
        <TabsList>
          <TabsTrigger value="issued">{t("tabs.issued")}</TabsTrigger>
          <TabsTrigger value="atRisk">{t("tabs.atRisk")}</TabsTrigger>
          <TabsTrigger value="template">{t("tabs.template")}</TabsTrigger>
        </TabsList>
        <TabsContent value="issued" className="pt-4 md:min-h-0 md:flex-1">
          <IssuedLettersPanel />
        </TabsContent>
        <TabsContent value="atRisk" className="pt-4 md:min-h-0 md:flex-1">
          <AtRiskPanel />
        </TabsContent>
        <TabsContent value="template" className="pt-4 md:min-h-0 md:flex-1">
          <WarningLetterTemplateView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
