"use client";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { DeliveriesView } from "./deliveries-view";
import { ProviderConfigView } from "./provider-config-view";
import { TemplatesView } from "./templates-view";

/**
 * WhatsApp gateway configuration, message templates, and the delivery
 * log: docs/12-roadmap.md Fase 5 ("adapter WhatsApp Business API dan
 * email; template pesan; log pengiriman").
 */
export function WhatsAppSettingsView(): ReactElement {
  const t = useTranslations("app.messaging");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <p className="text-[13px] text-fg-muted">{t("description")}</p>

      <Tabs defaultValue="provider">
        <TabsList>
          <TabsTrigger value="provider">{t("tabs.provider")}</TabsTrigger>
          <TabsTrigger value="templates">{t("tabs.templates")}</TabsTrigger>
          <TabsTrigger value="deliveries">{t("tabs.deliveries")}</TabsTrigger>
        </TabsList>
        <TabsContent value="provider" className="md:max-w-2xl">
          <ProviderConfigView />
        </TabsContent>
        <TabsContent value="templates">
          <TemplatesView />
        </TabsContent>
        <TabsContent value="deliveries">
          <DeliveriesView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
