"use client";

import type { components } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatRelative } from "@newsekolah/i18n";
import { EmptyState, SkeletonList, cn } from "@newsekolah/ui";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { navAccessFromMe } from "../../../lib/navigation-access";
import { useSession } from "../../../lib/session/session-provider";
import { useMarkReadMutation, useNotificationsQuery } from "../api";
import { openableHref } from "../lib/openable-href";

type Notification = components["schemas"]["Notification"];

/** How many the panel shows before sending the reader to the full page. */
const PANEL_LIMIT = 6;

/**
 * The recent notifications, shown from the header bell rather than on a
 * page of their own. Glancing at what arrived should not cost the reader
 * the screen they were working on; only following a notification
 * somewhere navigates. The bell's tab row names the list and carries
 * "mark all read", so the panel itself is only rows and the way to the
 * full page.
 */
export function NotificationPanel({ onNavigate }: { onNavigate: () => void }): ReactElement {
  const t = useTranslations("app.notifications");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const { data, isLoading, isError, refetch } = useNotificationsQuery({ unreadOnly: false });
  const markRead = useMarkReadMutation();
  const items = (data?.data ?? []).slice(0, PANEL_LIMIT);

  return (
    <div className="flex w-full flex-col">
      {isLoading ? (
        <SkeletonList rows={3} className="px-3 pb-2" />
      ) : isError && !data ? (
        <QueryError retry={() => refetch()} className="m-3" />
      ) : items.length === 0 ? (
        <EmptyState
          variant="inline"
          icon={<Bell />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          className="py-8"
        />
      ) : (
        <ul className="flex max-h-[min(24rem,55dvh)] flex-col divide-y divide-line overflow-y-auto overscroll-contain border-t border-line">
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
        className="border-t border-line px-3 py-3 text-center text-label text-accent outline-none transition-colors hover:bg-state-hover focus-visible:-outline-offset-2"
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
  const { me } = useSession();
  const t = useTranslations("app.notifications");
  const href = openableHref(item.href, navAccessFromMe(me));
  const unread = !item.read_at;
  const content = (
    <div className="flex items-start gap-3 px-3 py-3">
      <span
        aria-hidden="true"
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          unread ? "bg-accent" : "bg-transparent",
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("truncate text-body-sm text-fg", unread && "font-semibold")}>
          {unread && <span className="sr-only">{t("unreadMarker")} </span>}
          {item.title}
        </span>
        <span className="line-clamp-2 text-body-sm text-fg-muted">{item.body}</span>
        <span className="text-caption text-fg-muted">
          {formatRelative(item.created_at, { locale, timeZone })}
        </span>
      </div>
    </div>
  );

  const rowClass =
    "block w-full text-left outline-none transition-colors hover:bg-state-hover focus-visible:-outline-offset-2 active:bg-state-pressed";
  return (
    <li className={cn(unread && "bg-state-selected")}>
      {href ? (
        <Link
          href={href}
          onClick={() => {
            onOpen();
            onNavigate();
          }}
          className={rowClass}
        >
          {content}
        </Link>
      ) : (
        // The same row as the Link above for a notification with no target:
        // opening it only marks it read.
        // eslint-disable-next-line design-system/no-raw-elements -- bell row, see above
        <button type="button" onClick={onOpen} className={rowClass}>
          {content}
        </button>
      )}
    </li>
  );
}
