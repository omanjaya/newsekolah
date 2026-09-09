"use client";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { APIKeysPanel } from "./api-keys-panel";
import { WebhookDeliveriesPanel } from "./webhook-deliveries-panel";
import { WebhookEndpointsPanel } from "./webhook-endpoints-panel";

export function IntegrationsView(): ReactElement {
  const t = useTranslations("app.integrations");
  const [tab, setTab] = useState("apiKeys");
  const [deliveryEndpointId, setDeliveryEndpointId] = useState("");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <p className="text-[13px] text-fg-muted">{t("description")}</p>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="apiKeys">{t("tabs.apiKeys")}</TabsTrigger>
          <TabsTrigger value="webhooks">{t("tabs.webhooks")}</TabsTrigger>
          <TabsTrigger value="deliveries">{t("tabs.deliveries")}</TabsTrigger>
        </TabsList>
        <TabsContent value="apiKeys">
          <APIKeysPanel />
        </TabsContent>
        <TabsContent value="webhooks">
          <WebhookEndpointsPanel
            onSelectEndpoint={(endpointId) => {
              setDeliveryEndpointId(endpointId);
              setTab("deliveries");
            }}
          />
        </TabsContent>
        <TabsContent value="deliveries">
          <WebhookDeliveriesPanel
            endpointId={deliveryEndpointId}
            onEndpointChange={setDeliveryEndpointId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
