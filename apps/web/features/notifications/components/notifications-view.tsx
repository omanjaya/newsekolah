"use client";

import type { components } from "@newsekolah/api-client";
import type { Locale } from "@newsekolah/i18n";
import { formatRelative } from "@newsekolah/i18n";
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
} from "@newsekolah/ui";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { groupByDay } from "../../../lib/group-by-day";
import { useSession } from "../../../lib/session/session-provider";
import { useDayLabel } from "../../../lib/use-day-label";
import { useRememberedViewState } from "../../../lib/view-state/view-state-provider";
import {
  NOTIFICATION_KINDS,
  type NotificationKind,
  useMarkAllReadMutation,
  useMarkReadMutation,
  useNotificationsQuery,
} from "../api";

type Notification = components["schemas"]["Notification"];

export function NotificationsView(): ReactElement {
  const t = useTranslations("app.notifications");
  const tKinds = useTranslations("app.notifications.kinds");
  const locale = useLocale() as Locale;
  const { me } = useSession();
  const [filter, setFilter] = useRememberedViewState<"all" | "unread">(
    "notifications-filter",
    "all",
  );
  const [search, setSearch] = useRememberedViewState("notifications-search", "");
  const [kind, setKind] = useRememberedViewState<NotificationKind | "">("notifications-kind", "");
  const { data, isLoading, isError, refetch } = useNotificationsQuery({
    unreadOnly: filter === "unread",
    q: search.trim() || undefined,
    kind: kind || undefined,
  });
  const markRead = useMarkReadMutation();
  const markAllRead = useMarkAllReadMutation();
  const items = data?.data ?? [];
  const hasUnread = items.some((n) => !n.read_at);
  const isFiltering = search.trim() !== "" || kind !== "";
  const dayGroups = groupByDay(items, (item) => item.created_at, me?.tenant.timezone);
  const dayLabel = useDayLabel();

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<CheckCheck />}
            disabled={!hasUnread || markAllRead.isPending}
            onClick={() => {
              markAllRead.mutate();
            }}
          >
            {t("markAllRead")}
          </Button>
        }
      />

      <Tabs
        value={filter}
        onValueChange={(value) => {
          setFilter(value as "all" | "unread");
        }}
      >
        <TabsList>
          <TabsTrigger value="all">{t("filterAll")}</TabsTrigger>
          <TabsTrigger value="unread">{t("filterUnread")}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="w-full sm:w-64"
        />
        <Select
          options={[
            { value: "all", label: t("kindAll") },
            ...NOTIFICATION_KINDS.map((k) => ({ value: k, label: tKinds(k) })),
          ]}
          value={kind || "all"}
          onValueChange={(v) => {
            setKind(v === "all" ? "" : (v as NotificationKind));
          }}
          aria-label={t("kindFilterLabel")}
          className="w-full sm:w-56"
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError ? (
        <QueryError retry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell aria-hidden="true" />}
          title={
            isFiltering
              ? t("emptyFilteredTitle")
              : filter === "unread"
                ? t("emptyUnreadTitle")
                : t("emptyTitle")
          }
          description={isFiltering ? t("emptyFilteredBody") : t("emptyBody")}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {dayGroups.map((group) => (
            <section key={group.dateKey} className="flex flex-col gap-2">
              <h2 className="px-1 text-[12px] font-medium text-fg-muted">
                {dayLabel(group.dateKey)}
              </h2>
              <ul className="flex flex-col divide-y divide-border rounded-sm border border-border bg-surface">
                {group.items.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    locale={locale}
                    timeZone={me?.tenant.timezone}
                    onOpen={() => {
                      if (!item.read_at) markRead.mutate(item.id);
                    }}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  item,
  locale,
  timeZone,
  onOpen,
}: {
  item: Notification;
  locale: Locale;
  timeZone?: string;
  onOpen: () => void;
}): ReactElement {
  const t = useTranslations("app.notifications");
  const unread = !item.read_at;
  const content = (
    <div className="flex items-start gap-3 px-4 py-3">
      <span
        aria-hidden="true"
        className={cn("mt-2 size-2 shrink-0 rounded-xs", unread ? "bg-accent" : "bg-transparent")}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("text-[14px]", unread ? "font-medium text-fg" : "text-fg")}>
          {item.title}
        </span>
        <span className="text-[13px] text-fg-muted">{item.body}</span>
        <span className="text-[12px] text-fg-muted">
          {formatRelative(item.created_at, { locale, timeZone })}
          {unread && <span className="sr-only"> {t("unreadMarker")}</span>}
        </span>
      </div>
    </div>
  );

  return (
    <li className={cn(unread && "bg-accent/5")}>
      {item.href ? (
        <Link href={item.href} onClick={onOpen} className="block hover:bg-bg">
          {content}
        </Link>
      ) : (
        <button type="button" onClick={onOpen} className="block w-full text-left hover:bg-bg">
          {content}
        </button>
      )}
    </li>
  );
}
