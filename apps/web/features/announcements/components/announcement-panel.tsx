"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatRelative } from "@newsekolah/i18n";
import { Skeleton, cn } from "@newsekolah/ui";
import { Megaphone, Pin } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useSession } from "../../../lib/session/session-provider";
import {
  type MyAnnouncement,
  useMarkAnnouncementReadMutation,
  useMyAnnouncementsQuery,
} from "../api";

/** How many the panel shows before sending the reader to the full page. */
const PANEL_LIMIT = 6;

/**
 * The latest announcements addressed to the reader, shown in the header
 * bell. Announcements are something to read, not a place to work, so the
 * list lives here and the full page stays one link away. Following a row
 * records the read receipt, the same as expanding it on the page does.
 */
export function AnnouncementPanel({ onNavigate }: { onNavigate: () => void }): ReactElement {
  const tBell = useTranslations("app.bell");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const { data, isLoading } = useMyAnnouncementsQuery();
  const markRead = useMarkAnnouncementReadMutation();
  const items = (data?.data ?? []).slice(0, PANEL_LIMIT);

  return (
    <div className="flex w-full flex-col">
      {isLoading ? (
        <div className="flex flex-col gap-2 p-3" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
          <Megaphone className="size-5 text-fg-muted" aria-hidden="true" />
          <span className="text-body-sm text-fg-muted">{tBell("announcementsEmpty")}</span>
        </div>
      ) : (
        <ul className="flex max-h-80 flex-col divide-y divide-line overflow-y-auto">
          {items.map((item) => (
            <AnnouncementPanelRow
              key={item.id}
              item={item}
              locale={locale}
              timeZone={me?.tenant.timezone}
              onOpen={() => {
                if (!item.is_read) markRead.mutate(item.id);
                onNavigate();
              }}
            />
          ))}
        </ul>
      )}

      <Link
        href="/announcements"
        onClick={onNavigate}
        className="border-t border-line px-3 py-3 text-center text-label text-accent transition-colors hover:bg-state-hover"
      >
        {tBell("announcementsSeeAll")}
      </Link>
    </div>
  );
}

function AnnouncementPanelRow({
  item,
  locale,
  timeZone,
  onOpen,
}: {
  item: MyAnnouncement;
  locale: Locale;
  timeZone?: string;
  onOpen: () => void;
}): ReactElement {
  const t = useTranslations("app.announcements");
  const unread = !item.is_read;

  return (
    <li className={cn(unread && "bg-state-selected")}>
      <Link
        href="/announcements"
        onClick={onOpen}
        className="block transition-colors hover:bg-state-hover"
      >
        <div className="flex items-start gap-2 px-3 py-3">
          <span
            className={cn(
              "mt-1.5 size-2 shrink-0 rounded-full",
              unread ? "bg-accent" : "bg-transparent",
            )}
            role={unread ? "img" : undefined}
            aria-label={unread ? t("unread") : undefined}
            aria-hidden={unread ? undefined : true}
            data-testid={unread ? "bell-announcement-unread" : undefined}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-1.5">
              {item.is_pinned && (
                <Pin className="size-3.5 shrink-0 text-accent" aria-label={t("pinned")} />
              )}
              <span className={cn("truncate text-body-sm text-fg", unread && "font-semibold")}>
                {item.title}
              </span>
            </span>
            <span className="text-caption text-fg-muted">
              {formatRelative(item.published_at, { locale, timeZone })}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
