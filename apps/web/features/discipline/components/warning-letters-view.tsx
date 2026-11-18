"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan } from "../../../lib/session/session-provider";

import { IssuedLettersPanel } from "./issued-letters-panel";
import { WarningLetterTemplateView } from "./warning-letter-template-view";

/**
 * Surat peringatan: the letters issued, and the letter template for
 * whoever sets it up. Students due a letter live on the Pelanggaran page
 * (Kandidat SP), so the list has one home.
 */
export function WarningLettersView(): ReactElement {
  const t = useTranslations("app.discipline.warningLetters");
  const canEditTemplate = useCan("manage_settings");
  const [tab, setTab] = useUrlState<string>(
    "tab",
    ["issued", ...(canEditTemplate ? ["template"] : [])],
    "issued",
  );

  return (
    // No title or eyebrow of its own: the area's header (h1 "Tata tertib")
    // stays put between its tabs, and the current tab names this page.
    <AppPage variant="fit">
      {canEditTemplate ? (
        <Tabs value={tab} onValueChange={setTab} className="flex flex-col md:min-h-0 md:flex-1">
          <TabsList>
            <TabsTrigger value="issued">{t("tabs.issued")}</TabsTrigger>
            <TabsTrigger value="template">{t("tabs.template")}</TabsTrigger>
          </TabsList>
          <TabsContent value="issued" className="pt-4 md:min-h-0 md:flex-1">
            <IssuedLettersPanel />
          </TabsContent>
          <TabsContent value="template" className="pt-4 md:min-h-0 md:flex-1">
            <WarningLetterTemplateView />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex flex-col md:min-h-0 md:flex-1">
          <IssuedLettersPanel />
        </div>
      )}
    </AppPage>
  );
}
