"use client";

import type { components } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatRelative } from "@newsekolah/i18n";
import { Button, Skeleton, cn } from "@newsekolah/ui";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { useMarkAllReadMutation, useMarkReadMutation, useNotificationsQuery } from "../api";

type Notification = components["schemas"]["Notification"];

/** How many the panel shows before sending the reader to the full page. */
const PANEL_LIMIT = 6;

/**
 * The recent notifications, shown in the header rather than on a page of
 * their own. Glancing at what arrived should not cost the reader the
 * screen they were working on; only following a notification somewhere
 * should navigate.
 */
export function NotificationPanel({ onNavigate }: { onNavigate: () => void }): ReactElement {
  const t = useTranslations("app.notifications");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const { data, isLoading } = useNotificationsQuery(false);
  const markRead = useMarkReadMutation();
  const markAllRead = useMarkAllReadMutation();
  const items = (data?.data ?? []).slice(0, PANEL_LIMIT);
  const hasUnread = items.some((n) => !n.read_at);

  return (
    <div className="flex w-80 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-[13px] font-medium text-fg">{t("title")}</span>
        <Button
          variant="ghost"
          size="sm"
          icon={<CheckCheck />}
          disabled={!hasUnread || markAllRead.isPending}
          onClick={() => {
            markAllRead.mutate();
          }}
        >
          {t("markAllRead")}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2 p-3" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
          <Bell className="size-5 text-fg-muted" aria-hidden="true" />
          <span className="text-[13px] text-fg-muted">{t("emptyTitle")}</span>
        </div>
      ) : (
        <ul className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto">
          {items.map((item) => (
            <PanelRow
              key={item.id}
              item={item}
              locale={locale}
              timeZone={me?.tenant.timezone}
              onOpen={() => {
                if (!item.read_at) markRead.mutate(item.id);
              }}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}

      <Link
        href="/notifications"
        onClick={onNavigate}
        className="border-t border-border px-3 py-2 text-center text-[13px] text-accent hover:bg-bg"
      >
        {t("seeAll")}
      </Link>
    </div>
  );
}

function PanelRow({
  item,
  locale,
  timeZone,
  onOpen,
  onNavigate,
}: {
  item: Notification;
  locale: Locale;
  timeZone?: string;
  onOpen: () => void;
  onNavigate: () => void;
}): ReactElement {
  const unread = !item.read_at;
  const content = (
    <div className="flex items-start gap-2 px-3 py-2">
      <span
        aria-hidden="true"
        className={cn("mt-1.5 size-2 shrink-0 rounded-xs", unread ? "bg-accent" : "bg-transparent")}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("truncate text-[13px]", unread ? "font-medium text-fg" : "text-fg")}>
          {item.title}
        </span>
        <span className="line-clamp-2 text-[12px] text-fg-muted">{item.body}</span>
        <span className="text-[11px] text-fg-muted">
          {formatRelative(item.created_at, { locale, timeZone })}
        </span>
      </div>
    </div>
  );

  return (
    <li className={cn(unread && "bg-accent/5")}>
      {item.href ? (
        <Link
          href={item.href}
          onClick={() => {
            onOpen();
            onNavigate();
          }}
          className="block hover:bg-bg"
        >
          {content}
        </Link>
      ) : (
        <button type="button" onClick={onOpen} className="block w-full text-left hover:bg-bg">
          {content}
        </button>
      )}
    </li>
  );
}
