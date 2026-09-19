"use client";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan } from "../../../lib/session/session-provider";

import { DisciplinePolicyView } from "./discipline-policy-view";
import { ViolationCatalogView } from "./violation-catalog-view";
import { ViolationsLedgerView } from "./violations-ledger-view";

export function ViolationsView(): ReactElement {
  const t = useTranslations("app.discipline.violations");
  const canManageCatalog = useCan("manage_discipline_catalog");
  const canManagePolicy = useCan("manage_settings");
  const [tab, setTab] = useUrlState<string>(
    "tab",
    ["ledger", ...(canManageCatalog ? ["catalog"] : []), ...(canManagePolicy ? ["policy"] : [])],
    "ledger",
  );

  const showTabs = canManageCatalog || canManagePolicy;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      {showTabs ? (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="ledger">{t("tabs.ledger")}</TabsTrigger>
            {canManageCatalog && <TabsTrigger value="catalog">{t("tabs.catalog")}</TabsTrigger>}
            {canManagePolicy && <TabsTrigger value="policy">{t("tabs.policy")}</TabsTrigger>}
          </TabsList>
          <TabsContent value="ledger" className="pt-4">
            <ViolationsLedgerView />
          </TabsContent>
          {canManageCatalog && (
            <TabsContent value="catalog" className="pt-4">
              <ViolationCatalogView />
            </TabsContent>
          )}
          {canManagePolicy && (
            <TabsContent value="policy" className="pt-4">
              <DisciplinePolicyView />
            </TabsContent>
          )}
        </Tabs>
      ) : (
        <ViolationsLedgerView />
      )}
    </div>
  );
}
