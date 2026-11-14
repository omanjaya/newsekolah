"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { useUrlState } from "../../../lib/hooks/use-url-state";

import { ClassLoanBorrowPanel } from "./class-loan-borrow-panel";
import { ClassLoanReturnPanel } from "./class-loan-return-panel";
import { LibraryWorkspaceNav, useLibraryShortcuts } from "./library-workspace-nav";

type Tab = "borrow" | "returns";

/**
 * Class textbook loans: hand out one title to a whole class roster at once
 * at the start of the year, and take the whole set back at the end of it.
 */
export function ClassLoansView(): ReactElement {
  const t = useTranslations("app.library.classLoans");
  const [tab, setTab] = useUrlState<Tab>("tab", ["borrow", "returns"], "borrow");
  const shortcuts = useLibraryShortcuts([{ report: "loans" }]);

  return (
    <AppPage nav={<LibraryWorkspaceNav area="circulation" />} secondaryActions={shortcuts}>
      <Tabs
        className="flex flex-col gap-4"
        value={tab}
        onValueChange={(value) => {
          setTab(value as Tab);
        }}
      >
        <TabsList aria-label={t("tabsLabel")}>
          <TabsTrigger value="borrow">{t("tabs.borrow")}</TabsTrigger>
          <TabsTrigger value="returns">{t("tabs.returns")}</TabsTrigger>
        </TabsList>
        <TabsContent value="borrow" className="pt-0">
          <ClassLoanBorrowPanel />
        </TabsContent>
        <TabsContent value="returns" className="pt-0">
          <ClassLoanReturnPanel />
        </TabsContent>
      </Tabs>
    </AppPage>
  );
}
