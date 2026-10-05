"use client";

import { Button, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useCan } from "../../../lib/session/session-provider";

import { AnnouncementFeed } from "./announcement-feed";
import { AnnouncementsManage } from "./announcements-manage";

/**
 * Readers see their feed; anyone who can author also gets the manage tab.
 * The primary "Buat pengumuman" action lives in the shared `PageHeader` as
 * a pill control (docs/07-ui-ux.md), consistent with every other list
 * screen's header -- not a second button row above the manage table.
 */
export function AnnouncementsView(): ReactElement {
  const t = useTranslations("app.announcements");
  const canCreate = useCan("create_announcements");
  const canPublish = useCan("publish_announcements");
  const canManage = canCreate || canPublish;
  const [tab, setTab] = useState<"feed" | "manage">("feed");
  const [creating, setCreating] = useState(false);

  // Radix's `TabsContent` unmounts the inactive tab, so the create button
  // only belongs in the header while the manage tab is actually on screen
  // (canCreate implies canManage, so the feed-only branch below never
  // needs this action at all).
  const showCreate = canCreate && tab === "manage";
  const headerActions = showCreate ? (
    <Button
      size="sm"
      className="rounded-full"
      icon={<Plus />}
      onClick={() => {
        setCreating(true);
      }}
    >
      {t("actions.create")}
    </Button>
  ) : undefined;

  return (
    // Viewport-fit on desktop (100dvh minus the h-14 shell header): the page
    // itself never scrolls; the active tab's panel scrolls internally.
    <div className="flex flex-col gap-6 p-4 md:h-[calc(100dvh-3.5rem)] md:p-6">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} actions={headerActions} />
      {canManage ? (
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value as "feed" | "manage");
          }}
          className="flex flex-col md:min-h-0 md:flex-1"
        >
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
            <AnnouncementsManage creating={creating} onCreatingChange={setCreating} />
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
