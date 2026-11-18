"use client";

import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from "@newsekolah/ui";
import { Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { AppPage } from "../../../components/app-page";
import { useCan } from "../../../lib/session/session-provider";

import { AnnouncementFeed } from "./announcement-feed";
import { AnnouncementsManage } from "./announcements-manage";

type AnnouncementsTab = "feed" | "manage";

/**
 * Readers see their feed; anyone who can author also gets the manage tab,
 * kept in the URL. "Buat pengumuman" is the page's primary action from
 * either tab: from the feed it switches to the manage tab, whose editor is
 * what opens, so the action is never hidden behind the second tab.
 */
export function AnnouncementsView(): ReactElement {
  const t = useTranslations("app.announcements");
  const canCreate = useCan("create_announcements");
  const canPublish = useCan("publish_announcements");
  const canManage = canCreate || canPublish;
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const tab: AnnouncementsTab = canManage && search.get("tab") === "manage" ? "manage" : "feed";
  const [creating, setCreating] = useState(false);

  function selectTab(next: string) {
    const params = new URLSearchParams(search.toString());
    if (next === "manage") params.set("tab", "manage");
    else params.delete("tab");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const primaryAction = canCreate ? (
    <Button
      icon={<Plus />}
      onClick={() => {
        selectTab("manage");
        setCreating(true);
      }}
    >
      {t("actions.create")}
    </Button>
  ) : undefined;

  return (
    <AppPage
      nav={false}
      primaryAction={primaryAction}
      primaryActionCompact={
        canCreate
          ? {
              icon: <Plus />,
              label: t("actions.create"),
              onSelect: () => {
                selectTab("manage");
                setCreating(true);
              },
            }
          : undefined
      }
    >
      {canManage ? (
        <Tabs value={tab} onValueChange={selectTab} className="flex flex-col gap-5">
          <TabsList aria-label={t("tabsLabel")}>
            <TabsTrigger value="feed">{t("tabFeed")}</TabsTrigger>
            <TabsTrigger value="manage">{t("tabManage")}</TabsTrigger>
          </TabsList>
          <TabsContent value="feed">
            <AnnouncementFeed />
          </TabsContent>
          <TabsContent value="manage">
            <AnnouncementsManage creating={creating} onCreatingChange={setCreating} />
          </TabsContent>
        </Tabs>
      ) : (
        <AnnouncementFeed />
      )}
    </AppPage>
  );
}
