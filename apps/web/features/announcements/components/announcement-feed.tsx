"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatRelative } from "@newsekolah/i18n";
import {
  Alert,
  Card,
  cn,
  Disclosure,
  DisclosureContent,
  DisclosureIndicator,
  DisclosureTrigger,
  domainIcons,
  EmptyState,
  List,
  SafeHtml,
  SkeletonList,
} from "@newsekolah/ui";
import { Pin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

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
 * `focusId` (a notification's "?focus=<id>") opens that announcement's
 * card, records its read and scrolls it into view; when it is not in the
 * reader's feed (not visible yet, already ended, or not addressed to them)
 * a calm notice says so above the feed instead of a 404.
 *
 * `compact` (the dashboard's 3-item preview) keeps its own flat row list --
 * a 3-row widget has no room for a card grid -- and its props are
 * unchanged, since the dashboard depends on exactly this shape.
 */
export function AnnouncementFeed({
  limit,
  compact = false,
  focusId,
}: {
  limit?: number;
  compact?: boolean;
  focusId?: string;
}): ReactElement {
  const t = useTranslations("app.announcements");
  const { me } = useSession();
  const { data, isLoading, isError, error, refetch } = useMyAnnouncementsQuery();
  const markRead = useMarkAnnouncementReadMutation();
  const [open, setOpen] = useState<string | null>(focusId ?? null);
  const items = (data?.data ?? []).slice(0, limit);
  const focused = focusId ? items.find((item) => item.id === focusId) : undefined;
  const focusMissing = focusId !== undefined && data !== undefined && focused === undefined;
  useFocusedAnnouncement(focused, (id) => {
    markRead.mutate(id);
  });

  function toggle(item: MyAnnouncement) {
    setOpen((current) => (current === item.id ? null : item.id));
    if (!item.is_read) markRead.mutate(item.id);
  }

  if (compact) {
    // The home card's preview: rows straight in the card, the card's own
    // inset around the states (a framed empty box would be a frame in a
    // frame; audit home-personal-19).
    if (isLoading) {
      return (
        <div className="px-5 pb-5">
          <SkeletonList rows={2} leading={false} framed={false} />
        </div>
      );
    }
    if (isError) {
      return (
        <div className="px-5 pb-5">
          <QueryError retry={refetch} error={error} />
        </div>
      );
    }
    if (items.length === 0) {
      return (
        <div className="px-5 pb-5">
          <EmptyState
            variant="compact"
            icon={<domainIcons.announcement aria-hidden="true" />}
            title={t("feedEmptyCompact")}
          />
        </div>
      );
    }
    return (
      <List>
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
      </List>
    );
  }

  if (isLoading) {
    return <SkeletonList rows={3} leading={false} />;
  }
  if (isError) return <QueryError retry={refetch} error={error} />;
  const missingNotice = focusMissing ? (
    <Alert tone="info" title={t("focusMissingTitle")}>
      {t("focusMissingBody")}
    </Alert>
  ) : null;
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {missingNotice}
        <EmptyState
          icon={<domainIcons.announcement aria-hidden="true" />}
          title={t("feedEmptyTitle")}
          description={t("feedEmptyBody")}
        />
      </div>
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
    <div className="flex flex-col gap-4">
      {missingNotice}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="announcement-feed-cards">
        {cells.map((cell) => (
          <div
            key={cell.key}
            id={announcementCellId(cell.key)}
            data-testid={`announcement-feed-cell-${cell.key}`}
            className={cn(
              "flex h-full scroll-mt-4 flex-col",
              cell.span === "full" && "lg:col-span-2",
            )}
          >
            <div className="flex-1">{cell.node}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function announcementCellId(id: string): string {
  return `announcement-${id}`;
}

/**
 * Once the focused announcement is in the feed: records its read (opening
 * it is what reading means here) and scrolls its card into view, once per
 * focused id.
 */
function useFocusedAnnouncement(
  focused: MyAnnouncement | undefined,
  markRead: (id: string) => void,
): void {
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!focused || handled.current === focused.id) return;
    handled.current = focused.id;
    if (!focused.is_read) markRead(focused.id);
    document
      .getElementById(announcementCellId(focused.id))
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focused, markRead]);
}

/**
 * One row of the home card's preview: a disclosure that opens the body in
 * place (and records the read receipt), as a row of the card's List.
 */
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
    <li className="border-b border-line last:border-b-0">
      <Disclosure open={expanded} onOpenChange={onToggle}>
        <DisclosureTrigger className="flex w-full items-start gap-3 px-(--list-inset) py-3 transition-colors hover:bg-state-hover">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-2">
              {item.is_pinned && (
                <Pin className="size-4 shrink-0 text-accent" aria-label={t("pinned")} />
              )}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-body text-fg",
                  !item.is_read && "font-semibold",
                )}
              >
                {item.title}
              </span>
            </span>
            <span className="text-caption text-fg-muted">
              {formatRelative(item.published_at, { locale, timeZone: me?.tenant.timezone })}
            </span>
          </span>
          {!item.is_read && (
            <span
              className="mt-2 size-2 shrink-0 rounded-full bg-accent"
              role="img"
              aria-label={t("unread")}
            />
          )}
          <DisclosureIndicator className="mt-0.5" />
        </DisclosureTrigger>
        {/* The body mounts once opened; opening is what records the read. */}
        <DisclosureContent>
          {expanded && (
            <SafeHtml
              html={item.body_html}
              className="prose-announcement px-(--list-inset) pb-4 text-body text-fg"
            />
          )}
        </DisclosureContent>
      </Disclosure>
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
    <Card className="h-full overflow-hidden">
      <Disclosure open={expanded} onOpenChange={onToggle}>
        <DisclosureTrigger
          data-testid={`announcement-feed-card-${item.id}`}
          className="flex h-full w-full flex-col gap-1.5 p-5 transition-colors hover:bg-state-hover"
        >
          <div className="flex items-start gap-2">
            {item.is_pinned && (
              <Pin className="mt-0.5 size-4 shrink-0 text-accent" aria-label={t("pinned")} />
            )}
            <span className={cn("flex-1 text-heading text-fg", item.is_read && "font-semibold")}>
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
            <DisclosureIndicator className="mt-0.5" />
          </div>
          <span className="text-caption text-fg-muted">
            {formatRelative(item.published_at, { locale, timeZone })}
          </span>
          {excerpt && !expanded && (
            <p className="line-clamp-2 text-body-sm text-fg-muted">{excerpt}</p>
          )}
        </DisclosureTrigger>
        <DisclosureContent>
          {expanded && (
            <SafeHtml
              html={item.body_html}
              className="prose-announcement border-t border-line px-5 py-4 text-body text-fg"
            />
          )}
        </DisclosureContent>
      </Disclosure>
    </Card>
  );
}
