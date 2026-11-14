"use client";

import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useQuickAction } from "../../../lib/hooks/use-quick-action";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan } from "../../../lib/session/session-provider";

import { AtRiskPanel } from "./at-risk-panel";
import { DisciplinePolicyView } from "./discipline-policy-view";
import { ViolationCatalogView } from "./violation-catalog-view";
import { ViolationsLedgerView } from "./violations-ledger-view";

/**
 * Pelanggaran: the point ledger, the students due a warning letter, and
 * (for whoever manages them) the violation catalog and the letter policy.
 * Issued letters have one home, the Surat peringatan page next door.
 */
export function ViolationsView(): ReactElement {
  const t = useTranslations("app.discipline.violations");
  const tNav = useTranslations("app.shell.nav.items");
  const canViewLetters = useCan("view_discipline");
  const canRecord = useCan("record_violations");
  const canManageCatalog = useCan("manage_discipline_catalog");
  const canManagePolicy = useCan("manage_settings");
  const [tab, setTab] = useUrlState<string>(
    "tab",
    [
      "ledger",
      ...(canViewLetters ? ["atRisk"] : []),
      ...(canManageCatalog ? ["catalog"] : []),
      ...(canManagePolicy ? ["policy"] : []),
    ],
    "ledger",
  );
  const [recording, setRecording] = useState(false);
  function record() {
    setTab("ledger");
    setRecording(true);
  }
  useQuickAction("record-violation", record, canRecord);

  const showTabs = canViewLetters || canManageCatalog || canManagePolicy;
  const ledger = <ViolationsLedgerView recording={recording} onRecordingChange={setRecording} />;

  return (
    <AppPage
      variant="fit"
      title={t("title")}
      eyebrow={tNav("discipline")}
      primaryAction={
        canRecord ? (
          <Button icon={<Plus />} onClick={record}>
            {t("record")}
          </Button>
        ) : undefined
      }
    >
      {showTabs ? (
        <Tabs value={tab} onValueChange={setTab} className="flex flex-col md:min-h-0 md:flex-1">
          <TabsList>
            <TabsTrigger value="ledger">{t("tabs.ledger")}</TabsTrigger>
            {canViewLetters && <TabsTrigger value="atRisk">{t("tabs.atRisk")}</TabsTrigger>}
            {canManageCatalog && <TabsTrigger value="catalog">{t("tabs.catalog")}</TabsTrigger>}
            {canManagePolicy && <TabsTrigger value="policy">{t("tabs.policy")}</TabsTrigger>}
          </TabsList>
          <TabsContent value="ledger" className="pt-4 md:min-h-0 md:flex-1">
            {ledger}
          </TabsContent>
          {canViewLetters && (
            <TabsContent value="atRisk" className="pt-4 md:min-h-0 md:flex-1">
              <AtRiskPanel />
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
        <div className="flex flex-col md:min-h-0 md:flex-1">{ledger}</div>
      )}
    </AppPage>
  );
}
