"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatRelative } from "@newsekolah/i18n";
import { Badge, EmptyState, SafeHtml, Skeleton, cn, domainIcons } from "@newsekolah/ui";
import { ChevronDown, Pin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { groupByDay } from "../../../lib/group-by-day";
import { useSession } from "../../../lib/session/session-provider";
import { useDayLabel } from "../../../lib/use-day-label";
import {
  type MyAnnouncement,
  useMarkAnnouncementReadMutation,
  useMyAnnouncementsQuery,
} from "../api";

/**
 * The reader's list: pinned first (its own section, since a pin can be
 * from any day), then the rest grouped by day -- unread marked, body
 * expands in place and that first expansion records the read receipt.
 * Body HTML is sanitised server-side (bluemonday UGC policy) before it is
 * stored, and sanitised again client-side by `SafeHtml` as defense in
 * depth before it reaches the DOM.
 *
 * `compact` (the dashboard's 3-item preview) skips both the pinned split
 * and day grouping: a 3-row widget has no room for section headings.
 */
export function AnnouncementFeed({
  limit,
  compact = false,
}: {
  limit?: number;
  compact?: boolean;
}): ReactElement {
  const t = useTranslations("app.announcements");
  const { me } = useSession();
  const { data, isLoading, isError, refetch } = useMyAnnouncementsQuery();
  const markRead = useMarkAnnouncementReadMutation();
  const [open, setOpen] = useState<string | null>(null);
  const items = (data?.data ?? []).slice(0, limit);
  const dayLabel = useDayLabel();

  function toggle(item: MyAnnouncement) {
    setOpen((current) => (current === item.id ? null : item.id));
    if (!item.is_read) markRead.mutate(item.id);
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  if (isError) return <QueryError retry={refetch} />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<domainIcons.announcement aria-hidden="true" />}
        title={t("feedEmptyTitle")}
        description={t("feedEmptyBody")}
      />
    );
  }

  if (compact) {
    return (
      <ul className="flex flex-col divide-y divide-border">
        {items.map((item) => (
          <AnnouncementRow
            key={item.id}
            item={item}
            compact
            expanded={open === item.id}
            onToggle={() => {
              toggle(item);
            }}
          />
        ))}
      </ul>
    );
  }

  const pinned = items.filter((item) => item.is_pinned);
  const rest = items.filter((item) => !item.is_pinned);
  const dayGroups = groupByDay(rest, (item) => item.published_at, me?.tenant.timezone);

  return (
    <div className="flex flex-col gap-4">
      {pinned.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-[12px] font-medium text-fg-muted">{t("pinned")}</h2>
          <ul className="flex flex-col gap-2">
            {pinned.map((item) => (
              <AnnouncementRow
                key={item.id}
                item={item}
                expanded={open === item.id}
                onToggle={() => {
                  toggle(item);
                }}
              />
            ))}
          </ul>
        </section>
      )}
      {dayGroups.map((group) => (
        <section key={group.dateKey} className="flex flex-col gap-2">
          <h2 className="px-1 text-[12px] font-medium text-fg-muted">{dayLabel(group.dateKey)}</h2>
          <ul className="flex flex-col gap-2">
            {group.items.map((item) => (
              <AnnouncementRow
                key={item.id}
                item={item}
                expanded={open === item.id}
                onToggle={() => {
                  toggle(item);
                }}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function AnnouncementRow({
  item,
  expanded,
  onToggle,
  compact = false,
}: {
  item: MyAnnouncement;
  expanded: boolean;
  onToggle: () => void;
  compact?: boolean;
}): ReactElement {
  const t = useTranslations("app.announcements");
  const locale = useLocale() as Locale;
  const { me } = useSession();

  return (
    <li
      className={cn(
        compact ? "bg-surface" : "rounded-sm border border-border bg-surface",
        !compact && !item.is_read && "border-l-2 border-l-accent",
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className={cn(
          "flex w-full flex-col items-start gap-1 py-3 text-left",
          compact ? "px-1 hover:bg-bg" : "px-4",
        )}
      >
        <span className="flex w-full items-center gap-2">
          {item.is_pinned && (
            <Pin className="size-4 shrink-0 text-accent" aria-label={t("pinned")} />
          )}
          <span className={cn("flex-1 text-[15px]", !item.is_read && "font-medium")}>
            {item.title}
          </span>
          {!item.is_read && <Badge variant="accent">{t("unread")}</Badge>}
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-fg-muted transition-transform duration-[var(--duration-fast)]",
              expanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </span>
        <span className="text-[12px] text-fg-muted">
          {formatRelative(item.published_at, { locale, timeZone: me?.tenant.timezone })}
        </span>
      </button>
      {expanded && (
        <SafeHtml
          html={item.body_html}
          className="prose-announcement border-t border-border px-4 py-3 text-[14px] text-fg"
        />
      )}
    </li>
  );
}
