"use client";

import { IconButton, Popover, PopoverContent, PopoverTrigger } from "@newsekolah/ui";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { useUnreadCountQuery } from "../api";

import { NotificationPanel } from "./notification-panel";

/**
 * Header bell: unread badge from the inbox count, opening the recent
 * notifications in place. Glancing at what arrived should not cost the
 * reader the screen they were on, so only following one navigates.
 */
export function NotificationBell(): ReactElement {
  const t = useTranslations("app.notifications");
  const { status } = useSession();
  const { data } = useUnreadCountQuery(status === "authenticated");
  const [open, setOpen] = useState(false);
  const count = data?.count ?? 0;
  const label = count > 0 ? t("bellUnread", { count }) : t("bellLabel");

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
        <NotificationPanel
          onNavigate={() => {
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
