"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useUrlState } from "../../../lib/hooks/use-url-state";
import { SettingsPage } from "../../settings/components/settings-page";

import { APIKeysPanel } from "./api-keys-panel";
import { WebhookDeliveriesPanel } from "./webhook-deliveries-panel";
import { WebhookEndpointsPanel } from "./webhook-endpoints-panel";

/** API keys, webhook endpoints and their delivery log, one tab each; the tab lives in the URL. */
export function IntegrationsView(): ReactElement {
  const t = useTranslations("app.integrations");
  const [tab, setTab] = useUrlState<string>(
    "tab",
    ["apiKeys", "webhooks", "deliveries"],
    "apiKeys",
  );
  const [deliveryEndpointId, setDeliveryEndpointId] = useState("");

  return (
    <SettingsPage navKey="settings-integrations" variant="default" description={t("description")}>
      <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-5">
        <TabsList aria-label={t("tabsLabel")}>
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
    </SettingsPage>
  );
}
