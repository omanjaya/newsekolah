"use client";

import { Field, Select, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";

import { AcquisitionSourcesTab } from "./acquisition-sources-tab";
import { CollectionCategoriesTab } from "./collection-categories-tab";
import { DdcClassesTab } from "./ddc-classes-tab";
import { LocationsTab } from "./locations-tab";
import { MaterialTypesTab } from "./material-types-tab";
import { PartnersTab } from "./partners-tab";

const TABS = [
  "materialTypes",
  "acquisitionSources",
  "partners",
  "collectionCategories",
  "locations",
  "ddcClasses",
] as const;

type Tab =
  | "materialTypes"
  | "acquisitionSources"
  | "partners"
  | "ddcClasses"
  | "collectionCategories"
  | "locations";

/**
 * Catalogue data, a section of the library settings hub: material types,
 * acquisition sources, partners, collection categories, shelf locations
 * and the DDC class list, one pill tab each (kept in `?tab=`).
 */
export function MasterDataView(): ReactElement {
  const t = useTranslations("app.library.masterData");
  const [tab, setTab] = useUrlState<Tab>("tab", TABS, "materialTypes");

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        setTab(value as Tab);
      }}
      className="flex flex-col gap-4"
    >
      <TabsList aria-label={t("tabsLabel")} className="max-sm:hidden">
        <TabsTrigger value="materialTypes">{t("tabs.materialTypes")}</TabsTrigger>
        <TabsTrigger value="acquisitionSources">{t("tabs.acquisitionSources")}</TabsTrigger>
        <TabsTrigger value="partners">{t("tabs.partners")}</TabsTrigger>
        <TabsTrigger value="collectionCategories">{t("tabs.collectionCategories")}</TabsTrigger>
        <TabsTrigger value="locations">{t("tabs.locations")}</TabsTrigger>
        <TabsTrigger value="ddcClasses">{t("tabs.ddcClasses")}</TabsTrigger>
      </TabsList>
      <Field label={t("typeLabel")} className="sm:hidden">
        <Select
          options={TABS.map((key) => ({ value: key, label: t(`tabs.${key}`) }))}
          value={tab}
          onValueChange={(value) => {
            setTab(value as Tab);
          }}
        />
      </Field>
      <TabsContent value="materialTypes">
        <MaterialTypesTab />
      </TabsContent>
      <TabsContent value="acquisitionSources">
        <AcquisitionSourcesTab />
      </TabsContent>
      <TabsContent value="partners">
        <PartnersTab />
      </TabsContent>
      <TabsContent value="collectionCategories">
        <CollectionCategoriesTab />
      </TabsContent>
      <TabsContent value="locations">
        <LocationsTab />
      </TabsContent>
      <TabsContent value="ddcClasses">
        <DdcClassesTab />
      </TabsContent>
    </Tabs>
  );
}
