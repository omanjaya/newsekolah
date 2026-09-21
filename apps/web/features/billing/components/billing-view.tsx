"use client";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan } from "../../../lib/session/session-provider";

import { ArrearsReportView } from "./arrears-report-view";
import { FeeTypesView } from "./fee-types-view";
import { GenerationView } from "./generation-view";
import { PaymentDeskView } from "./payment-desk-view";

export function BillingView(): ReactElement {
  const t = useTranslations("app.billing");
  const canGenerate = useCan("generate_bills");
  const [tab, setTab] = useUrlState<string>(
    "tab",
    ["desk", "feeTypes", "arrears", ...(canGenerate ? ["generate"] : [])],
    "desk",
  );

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the active tab's panel scrolls internally.
    <div className="flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <Tabs value={tab} onValueChange={setTab} className="flex flex-col md:min-h-0 md:flex-1">
        <TabsList>
          <TabsTrigger value="desk">{t("tabs.desk")}</TabsTrigger>
          <TabsTrigger value="feeTypes">{t("tabs.feeTypes")}</TabsTrigger>
          {canGenerate && <TabsTrigger value="generate">{t("tabs.generate")}</TabsTrigger>}
          <TabsTrigger value="arrears">{t("tabs.arrears")}</TabsTrigger>
        </TabsList>
        <TabsContent value="desk" className="pt-4 md:min-h-0 md:flex-1">
          <PaymentDeskView />
        </TabsContent>
        <TabsContent value="feeTypes" className="pt-4 md:min-h-0 md:flex-1">
          <FeeTypesView />
        </TabsContent>
        {canGenerate && (
          <TabsContent value="generate" className="pt-4 md:min-h-0 md:flex-1">
            <GenerationView />
          </TabsContent>
        )}
        <TabsContent value="arrears" className="pt-4 md:min-h-0 md:flex-1">
          <ArrearsReportView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
