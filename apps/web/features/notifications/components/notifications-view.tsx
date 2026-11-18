"use client";

import type { components } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatRelative, formatTime } from "@newsekolah/i18n";
import {
  Button,
  Card,
  DataTableFilters,
  EmptyState,
  FilteredEmptyState,
  IconCircle,
  List,
  ListRow,
  SearchInput,
  SectionHeader,
  SegmentedControl,
  SkeletonList,
  domainIcons,
  type CategoryTone,
} from "@newsekolah/ui";
import { Bell, CheckCheck, Repeat, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useIsDesktop } from "../../../components/use-is-desktop";
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
  const isDesktop = useIsDesktop();
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

  // An inbox with nothing in it shows only its empty state: no filter, no
  // search and no menu holding a disabled mark-all. The controls stay
  // while the list loads, so a full inbox does not shift when it arrives.
  const hasList = isLoading || isError || items.length > 0 || isFiltering;
  const showFilter = hasList || hasUnread || filter === "unread";
  const markAll = () => {
    markAllRead.mutate();
  };

  return (
    <AppPage
      variant="narrow"
      nav={false}
      // Housekeeping, offered only while something is unread: on a phone
      // an item of the header's menu; from 768px a quiet button at the end
      // of the filter row, beside the list it acts on, instead of at the
      // far edge of the header's wider column.
      secondaryActions={
        !isDesktop && hasUnread
          ? [
              {
                label: t("markAllRead"),
                icon: <CheckCheck />,
                disabled: markAllRead.isPending,
                onSelect: markAll,
              },
            ]
          : undefined
      }
      toolbar={
        showFilter ? (
          // The full width of the toolbar row, so the search can grow into it.
          <div className="flex w-full flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
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
              {isDesktop && hasUnread && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<CheckCheck />}
                  loading={markAllRead.isPending}
                  onClick={markAll}
                >
                  {t("markAllRead")}
                </Button>
              )}
            </div>
            {hasList && (
              <div className="flex items-center gap-2">
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
                  className="min-w-0 flex-1"
                />
                {kinds.length > 0 && (
                  // The single-choice filter pill the other lists use (a
                  // popover, a bottom sheet on a phone), not a bordered
                  // select: "Jenis" until one is chosen, then its name.
                  <DataTableFilters
                    className="shrink-0"
                    filters={[
                      {
                        id: "kind",
                        label: t("kindPill"),
                        value: kind,
                        onChange: (value) => {
                          setKind(value as NotificationKind | "");
                        },
                        options: kinds.map((k) => ({ value: k, label: tKinds(k) })),
                      },
                    ]}
                  />
                )}
              </div>
            )}
          </div>
        ) : undefined
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
