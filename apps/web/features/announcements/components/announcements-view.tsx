"use client";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useCan } from "../../../lib/session/session-provider";

import { AnnouncementFeed } from "./announcement-feed";
import { AnnouncementsManage } from "./announcements-manage";

/** Readers see their feed; anyone who can author also gets the manage tab. */
export function AnnouncementsView(): ReactElement {
  const t = useTranslations("app.announcements");
  const canCreate = useCan("create_announcements");
  const canPublish = useCan("publish_announcements");
  const canManage = canCreate || canPublish;

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the active tab's panel scrolls internally.
    <div className="flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      {canManage ? (
        <Tabs defaultValue="feed" className="flex flex-col md:min-h-0 md:flex-1">
          <TabsList>
            <TabsTrigger value="feed">{t("tabFeed")}</TabsTrigger>
            <TabsTrigger value="manage">{t("tabManage")}</TabsTrigger>
          </TabsList>
          <TabsContent value="feed" className="pt-4 md:min-h-0 md:flex-1">
            <div className="md:h-full md:min-h-0 md:flex-1 md:overflow-y-auto">
              <AnnouncementFeed />
            </div>
          </TabsContent>
          <TabsContent value="manage" className="pt-4 md:min-h-0 md:flex-1">
            <AnnouncementsManage />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
          <AnnouncementFeed />
        </div>
      )}
    </div>
  );
}
