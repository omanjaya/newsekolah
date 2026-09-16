"use client";

import { PageHeader, Tabs, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { ClassLoanBorrowPanel } from "./class-loan-borrow-panel";
import { ClassLoanReturnPanel } from "./class-loan-return-panel";

type Tab = "borrow" | "returns";

/**
 * Class textbook loans: hand out one title to a whole class roster at once
 * at the start of the year, and take the whole set back at the end of it.
 */
export function ClassLoansView(): ReactElement {
  const t = useTranslations("app.library.classLoans");
  const [tab, setTab] = useState<Tab>("borrow");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as Tab);
        }}
      >
        <TabsList>
          <TabsTrigger value="borrow">{t("tabs.borrow")}</TabsTrigger>
          <TabsTrigger value="returns">{t("tabs.returns")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "borrow" ? <ClassLoanBorrowPanel /> : <ClassLoanReturnPanel />}
    </div>
  );
}
