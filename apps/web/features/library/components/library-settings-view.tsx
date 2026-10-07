"use client";

import { EmptyState, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import type { ReactElement } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { useSession } from "../../../lib/session/session-provider";
import {
  LIBRARY_SETTINGS_TABS,
  type LibrarySettingsTab,
  visibleLibrarySettingsTabs,
} from "../library-settings-tabs";

import { LoanRulesView } from "./loan-rules-view";
import { MasterDataView } from "./master-data-view";
import { MemberTypesView } from "./member-types-view";

/**
 * One page for the library configuration screens that used to be separate
 * menu entries. Each tab renders the existing view unchanged; the old routes
 * keep working. The tab lives in `?section=` because master data already
 * owns `?tab=` for its own sub-tabs.
 */
export function LibrarySettingsView(): ReactElement {
  const t = useTranslations("app.librarySettings");
  const { me } = useSession();
  const permissions = me?.permissions;
  const visible = useMemo(
    () => visibleLibrarySettingsTabs((code) => permissions?.includes(code) ?? false),
    [permissions],
  );
  const [requested, setTab] = useUrlState<LibrarySettingsTab>(
    "section",
    LIBRARY_SETTINGS_TABS,
    "loanRules",
  );
  const first = visible[0];

  if (!first) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
        <EmptyState title={t("noAccessTitle")} description={t("noAccessDescription")} />
      </div>
    );
  }
  const tab = visible.includes(requested) ? requested : first;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as LibrarySettingsTab);
        }}
      >
        <TabsList
          aria-label={t("tabsLabel")}
          className="overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap"
        >
          {visible.map((key) => (
            <TabsTrigger key={key} value={key}>
              {t(`tabs.${key}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {visible.includes("loanRules") && (
          <TabsContent value="loanRules">
            <LoanRulesView />
          </TabsContent>
        )}
        {visible.includes("memberTypes") && (
          <TabsContent value="memberTypes">
            <MemberTypesView />
          </TabsContent>
        )}
        {visible.includes("masterData") && (
          <TabsContent value="masterData">
            <MasterDataView />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
