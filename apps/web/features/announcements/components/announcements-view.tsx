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
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      {canManage ? (
        <Tabs defaultValue="feed">
          <TabsList>
            <TabsTrigger value="feed">{t("tabFeed")}</TabsTrigger>
            <TabsTrigger value="manage">{t("tabManage")}</TabsTrigger>
          </TabsList>
          <TabsContent value="feed" className="pt-4">
            <AnnouncementFeed />
          </TabsContent>
          <TabsContent value="manage" className="pt-4">
            <AnnouncementsManage />
          </TabsContent>
        </Tabs>
      ) : (
        <AnnouncementFeed />
      )}
    </div>
  );
}
