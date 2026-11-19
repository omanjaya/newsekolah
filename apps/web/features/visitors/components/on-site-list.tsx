"use client";

import { formatTime, type Locale } from "@newsekolah/i18n";
import { Avatar, Badge, Button, List, ListRow } from "@newsekolah/ui";
import { LogOut } from "lucide-react";
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
 * came to see, since when and for how long, and the one-tap check out
 * (confirmed by the caller). A visitor still here past the school day is
 * marked and was already sorted to the top.
 */
export function OnSiteList({
  entries,
  timeZone,
  canManage,
  onCheckOut,
}: {
  entries: BoardEntry[];
  timeZone?: string;
  canManage: boolean;
  onCheckOut: (visit: Visit) => void;
}): ReactElement {
  const t = useTranslations("app.visitors.board");
  const locale = useLocale() as Locale;
  const now = useBusinessNow();
  const stayLabel = useStayLabel();
  const hosts = useDirectoryNames(entries.map((entry) => entry.visit.host_user_id));

  return (
    <List framed aria-label={t("onSiteTitle")}>
      {entries.map(({ visit, overdue }) => {
        const host = hosts.get(visit.host_user_id)?.name;
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
            meta={
              <>
                {about && <span className="block truncate">{about}</span>}
                <span className="flex min-w-0 items-center gap-1.5">
                  {overdue && (
                    <Badge tone="warning" size="sm" dot>
                      {t("overdue")}
                    </Badge>
                  )}
                  <span className="truncate">
                    {host ? `${t("host", { name: host })} · ${arrival}` : arrival}
                    {/* The guard collects this card at check out, often from a
                        phone, where the trailing badge has no room. */}
                    {visit.badge_number && (
                      <span className="sm:hidden">
                        {` · ${t("badgeNumber", { number: visit.badge_number })}`}
                      </span>
                    )}
                  </span>
                </span>
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
              canManage ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<LogOut />}
                  aria-label={t("checkOutFor", { name: visit.full_name })}
                  onClick={() => {
                    onCheckOut(visit);
                  }}
                >
                  {t("checkOutShort")}
                </Button>
              ) : undefined
            }
          />
        );
      })}
    </List>
  );
}
