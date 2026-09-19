"use client";

import { PageHeader, Tabs, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";

import { AcquisitionSourcesTab } from "./acquisition-sources-tab";
import { DdcClassesTab } from "./ddc-classes-tab";
import { MaterialTypesTab } from "./material-types-tab";
import { PartnersTab } from "./partners-tab";

type Tab = "materialTypes" | "acquisitionSources" | "partners" | "ddcClasses";

/** Cataloguing master data: material types, acquisition sources, partners, and the DDC class list. */
export function MasterDataView(): ReactElement {
  const t = useTranslations("app.library.masterData");
  const [tab, setTab] = useUrlState<Tab>(
    "tab",
    ["materialTypes", "acquisitionSources", "partners", "ddcClasses"],
    "materialTypes",
  );

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
          <TabsTrigger value="materialTypes">{t("tabs.materialTypes")}</TabsTrigger>
          <TabsTrigger value="acquisitionSources">{t("tabs.acquisitionSources")}</TabsTrigger>
          <TabsTrigger value="partners">{t("tabs.partners")}</TabsTrigger>
          <TabsTrigger value="ddcClasses">{t("tabs.ddcClasses")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "materialTypes" && <MaterialTypesTab />}
      {tab === "acquisitionSources" && <AcquisitionSourcesTab />}
      {tab === "partners" && <PartnersTab />}
      {tab === "ddcClasses" && <DdcClassesTab />}
    </div>
  );
}
