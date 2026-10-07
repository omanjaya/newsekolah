"use client";

import {
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@newsekolah/ui";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { useMyAnnouncementsQuery } from "../../announcements/api";
import { AnnouncementPanel } from "../../announcements/components/announcement-panel";
import { useUnreadCountQuery } from "../api";

import { NotificationPanel } from "./notification-panel";

type BellTab = "notifications" | "announcements";

/**
 * Header bell: one badge for everything the reader has yet to read, opening
 * the recent notifications and announcements in place. Both are reading
 * surfaces rather than work areas, so they share a popover instead of each
 * taking a sidebar entry. Glancing at what arrived should not cost the
 * reader the screen they were on, so only following one navigates.
 *
 * The badge adds the unread announcements (the API exposes `is_read` per
 * announcement) to the inbox count.
 */
export function NotificationBell(): ReactElement {
  const t = useTranslations("app.notifications");
  const tBell = useTranslations("app.bell");
  const { status } = useSession();
  const authenticated = status === "authenticated";
  const { data } = useUnreadCountQuery(authenticated);
  const { data: announcements } = useMyAnnouncementsQuery();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<BellTab>("notifications");
  const unreadAnnouncements = authenticated
    ? (announcements?.data ?? []).filter((a) => !a.is_read).length
    : 0;
  const unreadNotifications = data?.count ?? 0;
  const count = unreadNotifications + unreadAnnouncements;
  const label = count > 0 ? tBell("unreadTotal", { count }) : t("bellLabel");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <span className="relative inline-flex">
        <PopoverTrigger asChild>
          <IconButton icon={<Bell />} aria-label={label} title={label} />
        </PopoverTrigger>
        {count > 0 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </span>
      {/*
        The width belongs on the popover itself. Setting it on the content
        inside made it wider than the box it sits in, so the text spilled
        past the panel's own background and onto the page behind it.
      */}
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-0">
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value as BellTab);
          }}
        >
          <TabsList aria-label={tBell("tabsLabel")} className="m-2 mb-0 w-[calc(100%-1rem)]">
            <TabsTrigger value="notifications" className="flex-1 gap-1.5">
              {tBell("tabNotifications")}
              <TabCount count={unreadNotifications} />
            </TabsTrigger>
            <TabsTrigger value="announcements" className="flex-1 gap-1.5">
              {tBell("tabAnnouncements")}
              <TabCount count={unreadAnnouncements} />
            </TabsTrigger>
          </TabsList>
          <TabsContent value="notifications" className="pt-2">
            <NotificationPanel
              onNavigate={() => {
                setOpen(false);
              }}
            />
          </TabsContent>
          <TabsContent value="announcements" className="pt-2">
            <AnnouncementPanel
              onNavigate={() => {
                setOpen(false);
              }}
            />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

function TabCount({ count }: { count: number }): ReactElement | null {
  if (count === 0) return null;
  return (
    <span
      aria-hidden="true"
      className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
