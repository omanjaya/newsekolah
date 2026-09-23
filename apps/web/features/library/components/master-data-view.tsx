"use client";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";

import { AcquisitionSourcesTab } from "./acquisition-sources-tab";
import { CollectionCategoriesTab } from "./collection-categories-tab";
import { DdcClassesTab } from "./ddc-classes-tab";
import { LocationsTab } from "./locations-tab";
import { MaterialTypesTab } from "./material-types-tab";
import { PartnersTab } from "./partners-tab";

type Tab =
  | "materialTypes"
  | "acquisitionSources"
  | "partners"
  | "ddcClasses"
  | "collectionCategories"
  | "locations";

/**
 * Cataloguing master data: material types, acquisition sources, partners,
 * collection categories, shelf locations, and the DDC class list.
 */
export function MasterDataView(): ReactElement {
  const t = useTranslations("app.library.masterData");
  const [tab, setTab] = useUrlState<Tab>(
    "tab",
    [
      "materialTypes",
      "acquisitionSources",
      "partners",
      "collectionCategories",
      "locations",
      "ddcClasses",
    ],
    "materialTypes",
  );

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the active tab's panel scrolls internally.
    <div className="flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as Tab);
        }}
        className="flex flex-col md:min-h-0 md:flex-1"
      >
        {/* Six tabs do not fit a phone: scroll the strip instead of the page. */}
        <TabsList className="overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap">
          <TabsTrigger value="materialTypes">{t("tabs.materialTypes")}</TabsTrigger>
          <TabsTrigger value="acquisitionSources">{t("tabs.acquisitionSources")}</TabsTrigger>
          <TabsTrigger value="partners">{t("tabs.partners")}</TabsTrigger>
          <TabsTrigger value="collectionCategories">{t("tabs.collectionCategories")}</TabsTrigger>
          <TabsTrigger value="locations">{t("tabs.locations")}</TabsTrigger>
          <TabsTrigger value="ddcClasses">{t("tabs.ddcClasses")}</TabsTrigger>
        </TabsList>
        <TabsContent value="materialTypes" className="md:min-h-0 md:flex-1">
          <MaterialTypesTab />
        </TabsContent>
        <TabsContent value="acquisitionSources" className="md:min-h-0 md:flex-1">
          <AcquisitionSourcesTab />
        </TabsContent>
        <TabsContent value="partners" className="md:min-h-0 md:flex-1">
          <PartnersTab />
        </TabsContent>
        <TabsContent value="collectionCategories" className="md:min-h-0 md:flex-1">
          <CollectionCategoriesTab />
        </TabsContent>
        <TabsContent value="locations" className="md:min-h-0 md:flex-1">
          <LocationsTab />
        </TabsContent>
        <TabsContent value="ddcClasses" className="md:min-h-0 md:flex-1">
          <DdcClassesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
