"use client";

import {
  Button,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@newsekolah/ui";
import { Bell, CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useIsDesktop } from "../../../components/use-is-desktop";
import { useModuleEnabled } from "../../../lib/modules/use-module-enabled";
import { useSession } from "../../../lib/session/session-provider";
import { useMyAnnouncementsQuery } from "../../announcements/api";
import { AnnouncementPanel } from "../../announcements/components/announcement-panel";
import { useMarkAllReadMutation, useUnreadCountQuery } from "../api";

import { NotificationPanel } from "./notification-panel";

type BellTab = "notifications" | "announcements";

/**
 * Header bell: one badge for everything the reader has yet to read, opening
 * the recent notifications and announcements in place. Both are reading
 * surfaces rather than work areas, so they share one panel instead of each
 * taking a sidebar entry. Glancing at what arrived should not cost the
 * reader the screen they were on, so only following one navigates. A
 * popover from the `md` breakpoint, a bottom sheet on a phone.
 *
 * The badge adds the unread announcements (the API exposes `is_read` per
 * announcement) to the inbox count.
 */
export function NotificationBell(): ReactElement {
  const t = useTranslations("app.notifications");
  const tBell = useTranslations("app.bell");
  const { status } = useSession();
  const authenticated = status === "authenticated";
  const announcementsOn = useModuleEnabled("announcements");
  const desktop = useIsDesktop();
  const { data } = useUnreadCountQuery(authenticated);
  const { data: announcements } = useMyAnnouncementsQuery();
  const markAllRead = useMarkAllReadMutation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<BellTab>("notifications");
  const unreadAnnouncements =
    authenticated && announcementsOn
      ? (announcements?.data ?? []).filter((a) => !a.is_read).length
      : 0;
  const unreadNotifications = data?.count ?? 0;
  const count = unreadNotifications + unreadAnnouncements;
  const label = count > 0 ? tBell("unreadTotal", { count }) : t("bellLabel");
  const close = () => {
    setOpen(false);
  };

  const button = (
    <IconButton
      icon={<Bell />}
      aria-label={label}
      tooltip={desktop}
      variant="surface"
      size="lg"
      className="md:size-9 md:border-transparent md:bg-transparent md:[&>svg]:size-[18px]"
    />
  );
  const badge =
    count > 0 ? (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1 text-caption font-bold text-accent-fg tabular-nums ring-2 ring-bg md:ring-surface"
      >
        {count > 99 ? "99+" : count}
      </span>
    ) : null;

  const body = (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        setTab(value as BellTab);
      }}
      className="flex min-h-0 flex-col"
    >
      <div className="flex items-center gap-2 pb-2 md:px-3 md:pt-3">
        <TabsList aria-label={tBell("tabsLabel")} size="sm" className="min-w-0">
          <TabsTrigger value="notifications" count={unreadNotifications || undefined}>
            {tBell("tabNotifications")}
          </TabsTrigger>
          {announcementsOn && (
            <TabsTrigger value="announcements" count={unreadAnnouncements || undefined}>
              {tBell("tabAnnouncements")}
            </TabsTrigger>
          )}
        </TabsList>
        {tab === "notifications" && unreadNotifications > 0 && (
          <Button
            variant="ghost"
            size="sm"
            icon={<CheckCheck />}
            disabled={markAllRead.isPending}
            onClick={() => {
              markAllRead.mutate();
            }}
            className="ml-auto shrink-0"
          >
            {t("markAllRead")}
          </Button>
        )}
      </div>
      <TabsContent value="notifications" className="mt-0">
        <NotificationPanel onNavigate={close} />
      </TabsContent>
      {announcementsOn && (
        <TabsContent value="announcements" className="mt-0">
          <AnnouncementPanel onNavigate={close} />
        </TabsContent>
      )}
    </Tabs>
  );

  if (desktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <span className="relative inline-flex">
          <PopoverTrigger asChild>{button}</PopoverTrigger>
          {badge}
        </span>
        <PopoverContent align="end" sideOffset={8} className="w-[24rem] p-0">
          {body}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <span className="relative inline-flex">
        <SheetTrigger asChild>{button}</SheetTrigger>
        {badge}
      </span>
      <SheetContent title={announcementsOn ? tBell("tabsLabel") : t("title")}>{body}</SheetContent>
    </Sheet>
  );
}
