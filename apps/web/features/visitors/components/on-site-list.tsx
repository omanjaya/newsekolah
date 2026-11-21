"use client";

import { formatTime, type Locale } from "@newsekolah/i18n";
import { Avatar, Badge, Button, IconButton, List, ListRow, cn } from "@newsekolah/ui";
import { LogOut, Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { useBusinessNow } from "../../../lib/simulation/clock";
import { useDirectoryNames } from "../../reference/directory-names";
import type { BoardEntry, Visit } from "../api";
import { minutesSince } from "../lib/board";

/** "45 mnt", "1 j 20 mnt": how long a visitor has been on site. */
export function useStayLabel(): (minutes: number) => string {
  const t = useTranslations("app.visitors.board");
  return (minutes) =>
    minutes >= 60
      ? t("stayHours", { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
      : t("stayMinutes", { minutes });
}

/**
 * The visitors on site as one list: who, from where and why, whom they
 * came to see, since when and for how long (each on a line of its own),
 * the badge they wear (with a print action), and the one-tap check out
 * (confirmed by the caller). A visitor still here past the school day is
 * marked and was already sorted to the top.
 *
 * The row follows the list's own width (a container query), not the
 * screen's: beside the sidebar and the board's second column, a tablet or
 * a small laptop leaves the list hardly more room than a phone, and the
 * wide row (the pass as a trailing chip, a labelled check out) squeezed
 * the text there to "Rin...", "Me...", "Mas...".
 * - Below 36rem the row is compact: check out is an icon, and the pass
 *   and the overdue mark each take a line of their own.
 * - From 36rem check out is labelled and the overdue mark leads the
 *   arrival line.
 * - From 48rem the pass is the trailing chip.
 */
export function OnSiteList({
  entries,
  timeZone,
  canManage,
  onCheckOut,
  onPrintBadge,
  printingBadgeId,
}: {
  entries: BoardEntry[];
  timeZone?: string;
  canManage: boolean;
  onCheckOut: (visit: Visit) => void;
  /** Opens the visit's printable badge; the action shows only for an issued badge. */
  onPrintBadge?: (visit: Visit) => void;
  /** The visit whose badge link is being fetched, shown as busy. */
  printingBadgeId?: string;
}): ReactElement {
  const t = useTranslations("app.visitors.board");
  const locale = useLocale() as Locale;
  const now = useBusinessNow();
  const stayLabel = useStayLabel();
  const hosts = useDirectoryNames(entries.map((entry) => entry.visit.host_user_id));
  const canPrint = (visit: Visit) => onPrintBadge !== undefined && visit.badge_number !== "";

  return (
    <div data-slot="on-site-list" className="@container">
      <List framed aria-label={t("onSiteTitle")}>
        {entries.map(({ visit, overdue }) => {
          const host = hosts.get(visit.host_user_id)?.name;
          const hostLine = host ? t("host", { name: host }) : undefined;
          const about = [visit.organization, visit.purpose].filter(Boolean).join(" · ");
          const arrivedAt = t("arrivedAt", {
            time: formatTime(visit.arrived_at, { locale, timeZone }),
          });
          const stay = stayLabel(minutesSince(visit.arrived_at, now));
          const overdueBadge = (
            <Badge tone="warning" size="sm" dot>
              {t("overdue")}
            </Badge>
          );
          return (
            <ListRow
              key={visit.id}
              data-overdue={overdue || undefined}
              leading={<Avatar name={visit.full_name} size={40} decorative />}
              title={visit.full_name}
              // Whom they came to see, since when, and the badge each get a
              // line of their own: sharing one, the host or the time was
              // cut to "Menemui Kep..." beside the row's buttons. The host
              // may take two lines and a compact row gives the overdue
              // mark one more, so the meta holds five.
              metaLines={5}
              meta={
                <>
                  {/* In a compact row with a host and a badge, the
                      organization and purpose give way to those. */}
                  {about && (
                    <span
                      title={about}
                      className={cn(
                        "block truncate",
                        hostLine && visit.badge_number && "@max-xl:hidden",
                      )}
                    >
                      {about}
                    </span>
                  )}
                  {/* Cut on one line, "Menemui Wakil Kepala Sekolah Contoh"
                      lost the name, and a title cannot be read on a touch
                      screen, so the host wraps instead. */}
                  {hostLine && (
                    <span title={hostLine} className="block break-words">
                      {hostLine}
                    </span>
                  )}
                  {/* Beside the arrival in a compact row, the mark left the
                      time no room ("Belum keluar  Masuk 0..."), so there it
                      takes a line of its own. */}
                  {overdue && (
                    <span data-slot="on-site-overdue" className="block @xl:hidden">
                      {overdueBadge}
                    </span>
                  )}
                  <span
                    data-slot="on-site-arrival"
                    title={`${arrivedAt} · ${stay}`}
                    className="flex min-w-0 items-center gap-1.5"
                  >
                    {overdue && (
                      <span className="hidden shrink-0 @xl:inline-flex">{overdueBadge}</span>
                    )}
                    {/* The time they came in never shrinks: only the running
                        stay after it is cut when the row is out of room. */}
                    <span className="flex min-w-0">
                      <span className="shrink-0 whitespace-nowrap">{arrivedAt}</span>
                      {/* A no-break space: a box's leading space collapses. */}
                      <span className="min-w-0 truncate">{`\u00a0· ${stay}`}</span>
                    </span>
                  </span>
                  {/* The guard collects this card at check out; until the
                      row has room for the trailing chip, it is a line here. */}
                  {visit.badge_number && (
                    <span data-slot="on-site-pass" className="block truncate @3xl:hidden">
                      {t("badgeNumber", { number: visit.badge_number })}
                    </span>
                  )}
                </>
              }
              trailing={
                visit.badge_number ? (
                  <Badge size="sm" className="hidden @3xl:inline-flex">
                    {t("badgeNumber", { number: visit.badge_number })}
                  </Badge>
                ) : undefined
              }
              action={
                canPrint(visit) || canManage ? (
                  <span className="flex items-center gap-1">
                    {canPrint(visit) && (
                      <IconButton
                        size="sm"
                        icon={<Printer />}
                        aria-label={t("printBadgeFor", { name: visit.full_name })}
                        loading={printingBadgeId === visit.id}
                        onClick={() => {
                          onPrintBadge?.(visit);
                        }}
                      />
                    )}
                    {canManage && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<LogOut />}
                        aria-label={t("checkOutFor", { name: visit.full_name })}
                        onClick={() => {
                          onCheckOut(visit);
                        }}
                      >
                        {/* Icon only in a compact row, leaving the text room
                            for the host, arrival and badge. */}
                        <span className="sr-only @xl:not-sr-only">{t("checkOutShort")}</span>
                      </Button>
                    )}
                  </span>
                ) : undefined
              }
            />
          );
        })}
      </List>
    </div>
  );
}
