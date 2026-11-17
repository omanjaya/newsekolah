"use client";

import {
  Button,
  Sheet,
  SheetContent,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  domainIcons,
  type PageHeaderAction,
} from "@newsekolah/ui";
import { Plus, Settings2 } from "lucide-react";
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

type Editor = "catalog" | "policy";

/**
 * Pelanggaran: the point ledger and the students due a warning letter, as
 * tabs. The settings behind them (the violation catalog and the letter
 * policy) are header actions for whoever manages them, each opening its
 * editor in a sheet, so the tabs keep to the data and fit a phone. Issued
 * letters have one home, the Surat peringatan page next door.
 */
export function ViolationsView(): ReactElement {
  const t = useTranslations("app.discipline.violations");
  const canViewLetters = useCan("view_discipline");
  const canRecord = useCan("record_violations");
  const canManageCatalog = useCan("manage_discipline_catalog");
  const canManagePolicy = useCan("manage_settings");
  const [tab, setTab] = useUrlState<string>(
    "tab",
    ["ledger", ...(canViewLetters ? ["atRisk"] : [])],
    "ledger",
  );
  const [recording, setRecording] = useState(false);
  function record() {
    setTab("ledger");
    setRecording(true);
  }
  useQuickAction("record-violation", record, canRecord);

  // The sheet keeps its last editor while it closes, so its title and body
  // do not change under the closing animation.
  const [editor, setEditor] = useState<Editor>("catalog");
  const [editorOpen, setEditorOpen] = useState(false);
  function openEditor(next: Editor) {
    setEditor(next);
    setEditorOpen(true);
  }
  const secondaryActions: PageHeaderAction[] = [
    ...(canManageCatalog
      ? [
          {
            label: t("tabs.catalog"),
            icon: <domainIcons.violation />,
            onSelect: () => {
              openEditor("catalog");
            },
          },
        ]
      : []),
    ...(canManagePolicy
      ? [
          {
            label: t("tabs.policy"),
            icon: <Settings2 />,
            onSelect: () => {
              openEditor("policy");
            },
          },
        ]
      : []),
  ];

  const ledger = <ViolationsLedgerView recording={recording} onRecordingChange={setRecording} />;

  return (
    // No title or eyebrow of its own: the area's header (h1 "Tata tertib")
    // stays put between its tabs, and the current tab names this page.
    <AppPage
      variant="fit"
      primaryAction={
        canRecord ? (
          <Button icon={<Plus />} onClick={record}>
            {t("record")}
          </Button>
        ) : undefined
      }
      secondaryActions={secondaryActions}
    >
      {canViewLetters ? (
        <Tabs value={tab} onValueChange={setTab} className="flex flex-col md:min-h-0 md:flex-1">
          <TabsList>
            <TabsTrigger value="ledger">{t("tabs.ledger")}</TabsTrigger>
            <TabsTrigger value="atRisk">{t("tabs.atRisk")}</TabsTrigger>
          </TabsList>
          <TabsContent value="ledger" className="pt-4 md:min-h-0 md:flex-1">
            {ledger}
          </TabsContent>
          <TabsContent value="atRisk" className="pt-4 md:min-h-0 md:flex-1">
            <AtRiskPanel />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex flex-col md:min-h-0 md:flex-1">{ledger}</div>
      )}

      {secondaryActions.length > 0 && (
        <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
          <SheetContent
            side="right"
            size={editor === "catalog" ? "lg" : "md"}
            title={editor === "catalog" ? t("tabs.catalog") : t("tabs.policy")}
          >
            {editor === "catalog" ? <ViolationCatalogView /> : <DisciplinePolicyView />}
          </SheetContent>
        </Sheet>
      )}
    </AppPage>
  );
}
