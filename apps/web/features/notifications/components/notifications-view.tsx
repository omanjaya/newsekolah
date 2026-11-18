"use client";

import type { components } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatRelative, formatTime } from "@newsekolah/i18n";
import {
  Button,
  Card,
  EmptyState,
  FilteredEmptyState,
  IconCircle,
  List,
  ListRow,
  SearchInput,
  SectionHeader,
  SegmentedControl,
  Select,
  SkeletonList,
  domainIcons,
  type CategoryTone,
} from "@newsekolah/ui";
import { Bell, CheckCheck, Repeat, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { dayKey, groupByDay } from "../../../lib/group-by-day";
import { navAccessFromMe } from "../../../lib/navigation-access";
import { useSession } from "../../../lib/session/session-provider";
import { businessNow } from "../../../lib/simulation/clock";
import { useDayLabel } from "../../../lib/use-day-label";
import { useRememberedViewState } from "../../../lib/view-state/view-state-provider";
import {
  useOwnNotificationKinds,
  type NotificationKind,
  useMarkAllReadMutation,
  useMarkReadMutation,
  useNotificationsQuery,
  useUnreadCountQuery,
} from "../api";
import { openableHref } from "../lib/openable-href";

type Notification = components["schemas"]["Notification"];

/**
 * One topic icon per family of notification kinds, the way stat tiles
 * colour theirs, taken from the domain icon map so a concept looks the
 * same here as on its own pages.
 */
const KIND_ICON: { prefix: string; icon: LucideIcon; tone: CategoryTone }[] = [
  { prefix: "announcement", icon: domainIcons.announcement, tone: "purple" },
  { prefix: "attendance", icon: domainIcons.attendance, tone: "green" },
  { prefix: "substitution", icon: Repeat, tone: "blue" },
  { prefix: "leave_request", icon: domainIcons.leave, tone: "amber" },
  { prefix: "exit_permit", icon: domainIcons.exitPermit, tone: "blue" },
  { prefix: "late_arrival", icon: domainIcons.late, tone: "red" },
];

function kindIcon(kind: string): { icon: LucideIcon; tone: CategoryTone } {
  return KIND_ICON.find((entry) => kind.startsWith(entry.prefix)) ?? { icon: Bell, tone: "green" };
}

/**
 * Every notification the reader received, grouped by day on the narrow
 * reading template: all or unread as a segmented filter, a search and a
 * kind filter, and each one a row with its topic icon that opens what it
 * points to (and marks it read).
 */
export function NotificationsView(): ReactElement {
  const t = useTranslations("app.notifications");
  const tKinds = useTranslations("app.notifications.kinds");
  const { me } = useSession();
  // Only the kinds this reader can be sent: a student never filters by
  // "a substitution was requested".
  const kinds = useOwnNotificationKinds();
  const [filter, setFilter] = useRememberedViewState<"all" | "unread">(
    "notifications-filter",
    "all",
  );
  const [search, setSearch] = useRememberedViewState("notifications-search", "");
  const [kind, setKind] = useRememberedViewState<NotificationKind | "">("notifications-kind", "");
  const { data, isLoading, isError, error, refetch } = useNotificationsQuery({
    unreadOnly: filter === "unread",
    q: search.trim() || undefined,
    kind: kind || undefined,
  });
  const markRead = useMarkReadMutation();
  const markAllRead = useMarkAllReadMutation();
  const items = data?.data ?? [];
  // Mark-all acts on every notification, not just the loaded page, so the
  // server count decides whether it is worth offering.
  const unreadCount = useUnreadCountQuery();
  const hasUnread = (unreadCount.data?.count ?? 0) > 0 || items.some((n) => !n.read_at);
  const isFiltering = search.trim() !== "" || kind !== "";
  const dayGroups = groupByDay(items, (item) => item.created_at, me?.tenant.timezone);
  // useDayLabel subscribes the view to the business clock, so the "today"
  // below moves with it, as the day headings do.
  const dayLabel = useDayLabel();
  const todayKey = dayKey(businessNow().toISOString(), me?.tenant.timezone);

  return (
    <AppPage
      variant="narrow"
      nav={false}
      // Housekeeping, not the page's main action: a button beside the title
      // from 640px up, an item of the header's menu on a phone.
      secondaryActions={[
        {
          label: t("markAllRead"),
          icon: <CheckCheck />,
          disabled: !hasUnread || markAllRead.isPending,
          onSelect: () => {
            markAllRead.mutate();
          },
        },
      ]}
      toolbar={
        // The full width of the toolbar row, so the search can grow into it.
        <div className="flex w-full flex-col gap-3">
          <SegmentedControl
            fullWidth="phone"
            aria-label={t("filterLabel")}
            options={[
              { value: "all", label: t("filterAll") },
              { value: "unread", label: t("filterUnread") },
            ]}
            value={filter}
            onValueChange={(value) => {
              setFilter(value);
            }}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              onClear={() => {
                setSearch("");
              }}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="sm:flex-1"
            />
            <Select
              options={[
                { value: "all", label: t("kindAll") },
                ...kinds.map((k) => ({ value: k, label: tKinds(k) })),
              ]}
              value={kind || "all"}
              onValueChange={(v) => {
                setKind(v === "all" ? "" : (v as NotificationKind));
              }}
              aria-label={t("kindFilterLabel")}
              className="sm:w-56"
            />
          </div>
        </div>
      }
    >
      {isLoading ? (
        <SkeletonList rows={5} />
      ) : isError ? (
        <QueryError retry={refetch} error={error} />
      ) : items.length === 0 ? (
        isFiltering ? (
          <FilteredEmptyState
            title={t("emptyFilteredTitle")}
            description={t("emptyFilteredBody")}
            onReset={() => {
              setSearch("");
              setKind("");
            }}
          />
        ) : (
          <EmptyState
            icon={
              filter === "unread" ? <CheckCheck aria-hidden="true" /> : <Bell aria-hidden="true" />
            }
            title={filter === "unread" ? t("emptyUnreadTitle") : t("emptyTitle")}
            description={t("emptyBody")}
            action={
              filter === "unread" ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFilter("all");
                  }}
                >
                  {t("showAll")}
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <div className="flex flex-col gap-6">
          {dayGroups.map((group) => (
            <section
              key={group.dateKey}
              className="flex flex-col gap-3"
              aria-labelledby={`notifications-${group.dateKey}`}
            >
              <SectionHeader
                titleId={`notifications-${group.dateKey}`}
                title={dayLabel(group.dateKey)}
              />
              <Card>
                <List variant="inset">
                  {group.items.map((item) => (
                    <NotificationRow
                      key={item.id}
                      item={item}
                      today={group.dateKey === todayKey}
                      timeZone={me?.tenant.timezone}
                      onOpen={() => {
                        if (!item.read_at) markRead.mutate(item.id);
                      }}
                    />
                  ))}
                </List>
              </Card>
            </section>
          ))}
        </div>
      )}
    </AppPage>
  );
}

function NotificationRow({
  item,
  today,
  timeZone,
  onOpen,
}: {
  item: Notification;
  /** Whether the row sits under today's heading. */
  today: boolean;
  timeZone?: string;
  onOpen: () => void;
}): ReactElement {
  const t = useTranslations("app.notifications");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const href = openableHref(item.href, navAccessFromMe(me));
  const unread = !item.read_at;
  const { icon: Icon, tone } = kindIcon(item.kind);
  // The day heading above already names the date, so the row ends in the
  // time alone ("19.00"), or "20 menit lalu" under today's: a short value
  // that never squeezes the title on a phone.
  const when = today
    ? formatRelative(item.created_at, { locale, timeZone, now: businessNow() })
    : formatTime(item.created_at, { locale, timeZone });
  // Unread is told by the bold title and the coloured icon, not by the
  // selected state, which would announce each unread row as the current item.
  return (
    <ListRow
      href={href}
      onClick={onOpen}
      chevron={Boolean(href)}
      leading={
        <IconCircle tone={unread ? tone : "neutral"} size="md">
          <Icon />
        </IconCircle>
      }
      title={
        <span className={unread ? undefined : "font-normal"}>
          {item.title}
          {unread && <span className="sr-only"> {t("unreadMarker")}</span>}
        </span>
      }
      meta={item.body}
      trailing={when}
    />
  );
}
