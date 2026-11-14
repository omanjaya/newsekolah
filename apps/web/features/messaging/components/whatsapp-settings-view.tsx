"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";

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
    // The settings area draws its own section switch above; this page names
    // itself after its menu entry rather than the settings hub.
    <AppPage nav={false} title={t("title")} description={t("description")}>
      <Tabs defaultValue="provider" className="flex flex-col gap-5">
        <TabsList aria-label={t("title")}>
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
    </AppPage>
  );
}
