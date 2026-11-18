"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger, type PageShellVariant } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useCan } from "../../../lib/session/session-provider";

import { ArrearsReportView } from "./arrears-report-view";
import { BillsListView } from "./bills-list-view";
import { FeeTypesView } from "./fee-types-view";
import { GenerationView } from "./generation-view";
import { PaymentDeskView } from "./payment-desk-view";

type BillingTab = "desk" | "bills" | "feeTypes" | "generate" | "arrears";

/** Tables fill the viewport and scroll inside; the desk and generation read as pages. */
const VARIANT: Record<BillingTab, PageShellVariant> = {
  desk: "default",
  bills: "fit",
  feeTypes: "fit",
  generate: "default",
  arrears: "fit",
};

/**
 * Billing, one page with its sections as tabs under the title: the payment
 * desk first (the daily work), then the bills list, fee types, issuing
 * bills (for those allowed to) and arrears. The tab is kept in the URL.
 */
export function BillingView(): ReactElement {
  const t = useTranslations("app.billing");
  const canGenerate = useCan("generate_bills");
  const tabs: BillingTab[] = [
    "desk",
    "bills",
    "feeTypes",
    ...(canGenerate ? (["generate"] as const) : []),
    "arrears",
  ];
  const [tab, setTab] = useUrlState<BillingTab>("tab", tabs, "desk");
  const panel = "flex flex-col gap-6 pt-0 md:min-h-0 md:flex-1";

  return (
    <Tabs
      value={tab}
      onValueChange={(next) => {
        setTab(next as BillingTab);
      }}
      className="contents"
    >
      <AppPage
        variant={VARIANT[tab]}
        documentTitle={t(`tabs.${tab}`)}
        nav={
          <TabsList variant="underline" aria-label={t("tabsLabel")}>
            {tabs.map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(`tabs.${value}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        }
      >
        <TabsContent value="desk" className={panel}>
          <PaymentDeskView />
        </TabsContent>
        <TabsContent value="bills" className={panel}>
          <BillsListView />
        </TabsContent>
        <TabsContent value="feeTypes" className={panel}>
          <FeeTypesView />
        </TabsContent>
        {canGenerate && (
          <TabsContent value="generate" className={panel}>
            <GenerationView />
          </TabsContent>
        )}
        <TabsContent value="arrears" className={panel}>
          <ArrearsReportView />
        </TabsContent>
      </AppPage>
    </Tabs>
  );
}
