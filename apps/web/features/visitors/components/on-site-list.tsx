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
 * (confirmed by the caller). A
 * visitor still here past the school day is marked and was already sorted
 * to the top.
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
    <List framed aria-label={t("onSiteTitle")}>
      {entries.map(({ visit, overdue }) => {
        const host = hosts.get(visit.host_user_id)?.name;
        const hostLine = host ? t("host", { name: host }) : undefined;
        const about = [visit.organization, visit.purpose].filter(Boolean).join(" · ");
        const arrival = t("arrived", {
          time: formatTime(visit.arrived_at, { locale, timeZone }),
          stay: stayLabel(minutesSince(visit.arrived_at, now)),
        });
        return (
          <ListRow
            key={visit.id}
            data-overdue={overdue || undefined}
            leading={<Avatar name={visit.full_name} size={40} decorative />}
            title={visit.full_name}
            // Whom they came to see, since when, and the badge each get a
            // line of their own: sharing one, the host or the time was cut
            // to "Menemui Kep..." beside the row's buttons, on a phone and
            // in the board's narrow desktop column alike. The fourth line
            // is the host's second on a phone (below).
            metaLines={4}
            meta={
              <>
                {/* On a phone with a host and a badge, the organization and
                    purpose give way to those. */}
                {about && (
                  <span
                    title={about}
                    className={cn(
                      "block truncate",
                      hostLine && visit.badge_number && "max-sm:hidden",
                    )}
                  >
                    {about}
                  </span>
                )}
                {/* A phone's text column (about 184px beside the row's
                    buttons) cuts "Menemui Wakil Kepala Sekolah Contoh" on
                    one line, and a title cannot be read there, so the host
                    wraps instead; from sm it keeps one line. */}
                {hostLine && (
                  <span title={hostLine} className="block break-words sm:truncate">
                    {hostLine}
                  </span>
                )}
                <span className="flex min-w-0 items-center gap-1.5">
                  {overdue && (
                    <Badge tone="warning" size="sm" dot>
                      {t("overdue")}
                    </Badge>
                  )}
                  {/* The running stay ends the line, so it is what a
                      narrow row cuts, never the time they came in. */}
                  <span title={arrival} className="truncate">
                    {arrival}
                  </span>
                </span>
                {/* The guard collects this card at check out, often from a
                    phone, where the trailing badge has no room. */}
                {visit.badge_number && (
                  <span className="block truncate sm:hidden">
                    {t("badgeNumber", { number: visit.badge_number })}
                  </span>
                )}
              </>
            }
            trailing={
              visit.badge_number ? (
                <Badge size="sm" className="hidden sm:inline-flex">
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
                      {/* Icon only on a phone, leaving the row's text room for
                          the host, arrival and badge. */}
                      <span className="sr-only sm:not-sr-only">{t("checkOutShort")}</span>
                    </Button>
                  )}
                </span>
              ) : undefined
            }
          />
        );
      })}
    </List>
  );
}
