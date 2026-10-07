"use client";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan } from "../../../lib/session/session-provider";
import { DisciplineWorkspaceNav } from "../../student-services/components/service-workspace-nav";

import { AtRiskPanel } from "./at-risk-panel";
import { DisciplinePolicyView } from "./discipline-policy-view";
import { IssuedLettersPanel } from "./issued-letters-panel";
import { ViolationCatalogView } from "./violation-catalog-view";
import { ViolationsLedgerView } from "./violations-ledger-view";

export function ViolationsView(): ReactElement {
  const workspace = useTranslations("app.serviceWorkspace");
  const t = useTranslations("app.discipline.violations");
  const canViewLetters = useCan("view_discipline");
  const canManageCatalog = useCan("manage_discipline_catalog");
  const canManagePolicy = useCan("manage_settings");
  const [tab, setTab] = useUrlState<string>(
    "tab",
    [
      "ledger",
      ...(canViewLetters ? ["atRisk", "letters"] : []),
      ...(canManageCatalog ? ["catalog"] : []),
      ...(canManagePolicy ? ["policy"] : []),
    ],
    "ledger",
  );

  const showTabs = canViewLetters || canManageCatalog || canManagePolicy;

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the active tab's panel scrolls internally.
    <div className="flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
      <DisciplineWorkspaceNav />
      <PageHeader eyebrow={t("eyebrow")} title={workspace("discipline")} />
      {showTabs ? (
        <Tabs value={tab} onValueChange={setTab} className="flex flex-col md:min-h-0 md:flex-1">
          <TabsList>
            <TabsTrigger value="ledger">{t("tabs.ledger")}</TabsTrigger>
            {canViewLetters && <TabsTrigger value="atRisk">{t("tabs.atRisk")}</TabsTrigger>}
            {canViewLetters && <TabsTrigger value="letters">{t("tabs.letters")}</TabsTrigger>}
            {canManageCatalog && <TabsTrigger value="catalog">{t("tabs.catalog")}</TabsTrigger>}
            {canManagePolicy && <TabsTrigger value="policy">{t("tabs.policy")}</TabsTrigger>}
          </TabsList>
          <TabsContent value="ledger" className="pt-4 md:min-h-0 md:flex-1">
            <ViolationsLedgerView />
          </TabsContent>
          {canViewLetters && (
            <TabsContent value="atRisk" className="pt-4 md:min-h-0 md:flex-1">
              <AtRiskPanel />
            </TabsContent>
          )}
          {canViewLetters && (
            <TabsContent value="letters" className="pt-4 md:min-h-0 md:flex-1">
              <IssuedLettersPanel />
            </TabsContent>
          )}
          {canManageCatalog && (
            <TabsContent value="catalog" className="pt-4 md:min-h-0 md:flex-1">
              <ViolationCatalogView />
            </TabsContent>
          )}
          {canManagePolicy && (
            <TabsContent value="policy" className="pt-4 md:min-h-0 md:flex-1">
              <DisciplinePolicyView />
            </TabsContent>
          )}
        </Tabs>
      ) : (
        <div className="flex flex-col md:min-h-0 md:flex-1">
          <ViolationsLedgerView />
        </div>
      )}
    </div>
  );
}
