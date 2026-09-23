"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatRelative } from "@newsekolah/i18n";
import { Badge, EmptyState, Skeleton, cn, domainIcons } from "@newsekolah/ui";
import { ChevronDown, Pin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { useSession } from "../../../lib/session/session-provider";
import { useMarkAnnouncementReadMutation, useMyAnnouncementsQuery } from "../api";

/**
 * The reader's list: pinned first, unread marked, body expands in place and
 * that first expansion records the read receipt. Body HTML is sanitised
 * server-side (bluemonday UGC policy) before it is stored.
 */
export function AnnouncementFeed({
  limit,
  compact = false,
}: {
  limit?: number;
  compact?: boolean;
}): ReactElement {
  const t = useTranslations("app.announcements");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const { data, isLoading, isError, refetch } = useMyAnnouncementsQuery();
  const markRead = useMarkAnnouncementReadMutation();
  const [open, setOpen] = useState<string | null>(null);
  const items = (data?.data ?? []).slice(0, limit);

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

  return (
    <ul className={cn("flex flex-col", compact ? "divide-y divide-border" : "gap-2")}>
      {items.map((item) => {
        const expanded = open === item.id;
        return (
          <li
            key={item.id}
            className={cn(
              compact ? "bg-surface" : "rounded-sm border border-border bg-surface",
              !compact && !item.is_read && "border-l-2 border-l-accent",
            )}
          >
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => {
                setOpen(expanded ? null : item.id);
                if (!item.is_read) markRead.mutate(item.id);
              }}
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
              <div
                className="prose-announcement border-t border-border px-4 py-3 text-[14px] text-fg"
                // Sanitised server-side; see announcements/service/content.go.
                dangerouslySetInnerHTML={{ __html: item.body_html }}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
