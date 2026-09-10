"use client";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useCan } from "../../../lib/session/session-provider";

import { ArrearsReportView } from "./arrears-report-view";
import { FeeTypesView } from "./fee-types-view";
import { GenerationView } from "./generation-view";
import { PaymentDeskView } from "./payment-desk-view";

export function BillingView(): ReactElement {
  const t = useTranslations("app.billing");
  const canGenerate = useCan("generate_bills");
  const [tab, setTab] = useState("desk");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="desk">{t("tabs.desk")}</TabsTrigger>
          <TabsTrigger value="feeTypes">{t("tabs.feeTypes")}</TabsTrigger>
          {canGenerate && <TabsTrigger value="generate">{t("tabs.generate")}</TabsTrigger>}
          <TabsTrigger value="arrears">{t("tabs.arrears")}</TabsTrigger>
        </TabsList>
        <TabsContent value="desk" className="pt-4">
          <PaymentDeskView />
        </TabsContent>
        <TabsContent value="feeTypes" className="pt-4">
          <FeeTypesView />
        </TabsContent>
        {canGenerate && (
          <TabsContent value="generate" className="pt-4">
            <GenerationView />
          </TabsContent>
        )}
        <TabsContent value="arrears" className="pt-4">
          <ArrearsReportView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
