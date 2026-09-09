"use client";

import type { components } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatRelative } from "@newsekolah/i18n";
import {
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
} from "@newsekolah/ui";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { useSession } from "../../../lib/session/session-provider";
import { useMarkAllReadMutation, useMarkReadMutation, useNotificationsQuery } from "../api";

type Notification = components["schemas"]["Notification"];

export function NotificationsView(): ReactElement {
  const t = useTranslations("app.notifications");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const { data, isLoading } = useNotificationsQuery(filter === "unread");
  const markRead = useMarkReadMutation();
  const markAllRead = useMarkAllReadMutation();
  const items = data?.data ?? [];
  const hasUnread = items.some((n) => !n.read_at);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<CheckCheck />}
            disabled={!hasUnread || markAllRead.isPending}
            onClick={() => {
              markAllRead.mutate();
            }}
          >
            {t("markAllRead")}
          </Button>
        }
      />

      <Tabs
        value={filter}
        onValueChange={(value) => {
          setFilter(value as "all" | "unread");
        }}
      >
        <TabsList>
          <TabsTrigger value="all">{t("filterAll")}</TabsTrigger>
          <TabsTrigger value="unread">{t("filterUnread")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell aria-hidden="true" />}
          title={filter === "unread" ? t("emptyUnreadTitle") : t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-sm border border-border bg-surface">
          {items.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              locale={locale}
              timeZone={me?.tenant.timezone}
              onOpen={() => {
                if (!item.read_at) markRead.mutate(item.id);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationRow({
  item,
  locale,
  timeZone,
  onOpen,
}: {
  item: Notification;
  locale: Locale;
  timeZone?: string;
  onOpen: () => void;
}): ReactElement {
  const t = useTranslations("app.notifications");
  const unread = !item.read_at;
  const content = (
    <div className="flex items-start gap-3 px-4 py-3">
      <span
        aria-hidden="true"
        className={cn("mt-2 size-2 shrink-0 rounded-xs", unread ? "bg-accent" : "bg-transparent")}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("text-[14px]", unread ? "font-medium text-fg" : "text-fg")}>
          {item.title}
        </span>
        <span className="text-[13px] text-fg-muted">{item.body}</span>
        <span className="text-[12px] text-fg-muted">
          {formatRelative(item.created_at, { locale, timeZone })}
          {unread && <span className="sr-only"> {t("unreadMarker")}</span>}
        </span>
      </div>
    </div>
  );

  return (
    <li className={cn(unread && "bg-accent/5")}>
      {item.href ? (
        <Link href={item.href} onClick={onOpen} className="block hover:bg-bg">
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
