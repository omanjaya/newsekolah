"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatRelative } from "@newsekolah/i18n";
import { Badge, Card, EmptyState, SafeHtml, Skeleton, cn, domainIcons } from "@newsekolah/ui";
import { ChevronDown, Pin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useState } from "react";

import { QueryError } from "../../../components/query-error";
import { bentoCells } from "../../../lib/layout/bento";
import { useSession } from "../../../lib/session/session-provider";
import {
  type MyAnnouncement,
  useMarkAnnouncementReadMutation,
  useMyAnnouncementsQuery,
} from "../api";
import { htmlToExcerpt } from "../lib/html-excerpt";

/**
 * The reader's list: pinned/important first, each as a bento card (title,
 * relative date, excerpt, unread dot) -- body expands in place on a tap,
 * and that first expansion records the read receipt. Body HTML is
 * sanitised server-side (bluemonday UGC policy) before it is stored, and
 * sanitised again client-side by `SafeHtml` as defense in depth before it
 * reaches the DOM.
 *
 * `MyAnnouncement` carries no audience/author and no attachment field (it
 * is already scoped to "announcements addressed to me", and the API has
 * no attachment concept yet), so the card omits both rather than
 * inventing data the server never sends.
 *
 * `compact` (the dashboard's 3-item preview) keeps its own flat row list --
 * a 3-row widget has no room for a card grid -- and its props are
 * unchanged, since the dashboard depends on exactly this shape.
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
            expanded={open === item.id}
            onToggle={() => {
              toggle(item);
            }}
          />
        ))}
      </ul>
    );
  }

  // Pinned/important first, otherwise the order the server already sent
  // (newest first) -- a stable sort, so same-priority items keep that
  // order instead of a grouped-by-day layout the symmetric bento grid has
  // no room for.
  const sorted = [...items].sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned));
  const cells = bentoCells(
    sorted.map((item) => ({
      key: item.id,
      node: (
        <AnnouncementCard
          item={item}
          timeZone={me?.tenant.timezone}
          expanded={open === item.id}
          onToggle={() => {
            toggle(item);
          }}
        />
      ),
    })),
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="announcement-feed-cards">
      {cells.map((cell) => (
        <div
          key={cell.key}
          data-testid={`announcement-feed-cell-${cell.key}`}
          className={cn("flex h-full flex-col", cell.span === "full" && "lg:col-span-2")}
        >
          <div className="flex-1">{cell.node}</div>
        </div>
      ))}
    </div>
  );
}

/** The dashboard's compact preview row -- unchanged from before the bento redesign. */
function AnnouncementRow({
  item,
  expanded,
  onToggle,
}: {
  item: MyAnnouncement;
  expanded: boolean;
  onToggle: () => void;
}): ReactElement {
  const t = useTranslations("app.announcements");
  const locale = useLocale() as Locale;
  const { me } = useSession();

  return (
    <li className="bg-surface">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex w-full flex-col items-start gap-1 px-1 py-3 text-left hover:bg-bg"
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

/**
 * One reader card in the full bento feed: title (bold + an unread dot
 * while unread), relative date, a plain-text excerpt, and the full body in
 * place once tapped. A pinned item gets the pin glyph next to its title.
 */
function AnnouncementCard({
  item,
  timeZone,
  expanded,
  onToggle,
}: {
  item: MyAnnouncement;
  timeZone?: string;
  expanded: boolean;
  onToggle: () => void;
}): ReactElement {
  const t = useTranslations("app.announcements");
  const locale = useLocale() as Locale;
  const excerpt = htmlToExcerpt(item.body_html);

  return (
    <Card className={cn("h-full", !item.is_read && "border-l-2 border-l-accent")}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        data-testid={`announcement-feed-card-${item.id}`}
        className="flex h-full w-full flex-col gap-2 rounded-lg p-4 text-left hover:bg-bg"
      >
        <div className="flex items-start gap-2">
          {item.is_pinned && (
            <Pin className="mt-0.5 size-4 shrink-0 text-accent" aria-label={t("pinned")} />
          )}
          <span className={cn("flex-1 text-[15px]", !item.is_read && "font-medium text-fg")}>
            {item.title}
          </span>
          {!item.is_read && (
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
              role="img"
              aria-label={t("unread")}
              data-testid="announcement-unread-dot"
            />
          )}
          <ChevronDown
            className={cn(
              "mt-0.5 size-4 shrink-0 text-fg-muted transition-transform duration-[var(--duration-fast)]",
              expanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </div>
        <span className="text-[12px] text-fg-muted">
          {formatRelative(item.published_at, { locale, timeZone })}
        </span>
        {excerpt && !expanded && (
          <p className="line-clamp-2 text-[13px] text-fg-muted">{excerpt}</p>
        )}
      </button>
      {expanded && (
        <SafeHtml
          html={item.body_html}
          className="prose-announcement border-t border-border px-4 py-3 text-[14px] text-fg"
        />
      )}
    </Card>
  );
}
