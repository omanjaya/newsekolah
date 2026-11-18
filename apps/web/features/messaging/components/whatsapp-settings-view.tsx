"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { SettingsPage } from "../../settings/components/settings-page";
import { SettingsSaveBar } from "../../settings/components/settings-save-bar";

import { DeliveriesView } from "./deliveries-view";
import { ProviderConfigView } from "./provider-config-view";
import { TemplatesView } from "./templates-view";
import { useProviderConfigForm } from "./use-provider-config-form";

const PANELS = ["provider", "templates", "deliveries"] as const;
type Panel = (typeof PANELS)[number];

/**
 * WhatsApp gateway configuration, message templates, and the delivery
 * log: docs/12-roadmap.md Fase 5 ("adapter WhatsApp Business API dan
 * email; template pesan; log pengiriman"). It sits in the settings frame
 * like its sibling pages: its registry name as the title, a trail back to
 * the hub and the communication section's pages as tabs under the header,
 * with the page's own three panels below, the open one kept in the URL.
 * The provider's form saves from the settings save bar, which stays while
 * a change is pending even when another panel is open.
 */
export function WhatsAppSettingsView(): ReactElement {
  const t = useTranslations("app.messaging");
  const [panel, setPanel] = useUrlState<Panel>("panel", PANELS, "provider");
  const provider = useProviderConfigForm();

  return (
    <SettingsPage
      navKey="settings-whatsapp"
      variant="default"
      description={t("description")}
      floating={
        <SettingsSaveBar
          container="default"
          dirty={provider.dirty}
          saving={provider.saving}
          onSave={() => void provider.save()}
          onDiscard={provider.discard}
        />
      }
    >
      <Tabs
        value={panel}
        onValueChange={(value) => {
          setPanel(value as Panel);
        }}
        className="flex flex-col gap-6"
      >
        <TabsList aria-label={t("title")}>
          <TabsTrigger value="provider">{t("tabs.provider")}</TabsTrigger>
          <TabsTrigger value="templates">{t("tabs.templates")}</TabsTrigger>
          <TabsTrigger value="deliveries">{t("tabs.deliveries")}</TabsTrigger>
        </TabsList>
        {/* A form reads at the narrow page width, as on the other settings pages. */}
        <TabsContent value="provider" className="max-w-narrow pt-0">
          <ProviderConfigView controller={provider} />
        </TabsContent>
        <TabsContent value="templates" className="pt-0">
          <TemplatesView />
        </TabsContent>
        <TabsContent value="deliveries" className="pt-0">
          <DeliveriesView />
        </TabsContent>
      </Tabs>
    </SettingsPage>
  );
}
