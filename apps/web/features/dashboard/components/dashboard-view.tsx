"use client";

import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  HeroCard,
  IconCircle,
  List,
  ListRow,
  Progress,
  Skeleton,
  Stat,
  StatGrid,
  TextLink,
  cn,
} from "@newsekolah/ui";
import { Bell, RotateCw } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { AppPage } from "../../../components/app-page";
import { QueryError } from "../../../components/query-error";
import { useIsDesktop, useIsWideTwoColumn } from "../../../components/use-is-desktop";
import { isModuleEnabled } from "../../../lib/modules/feature-modules";
import { navAccessFromMe } from "../../../lib/navigation-access";
import { canOpenPath } from "../../../lib/navigation-permissions";
import { QUICK_ACTION_TONE, sortQuickActions } from "../../../lib/navigation-quick-actions";
import { quickActionHref } from "../../../lib/quick-actions";
import { businessNow, useSimulation } from "../../../lib/simulation/clock";
import { useQuickActions } from "../../../lib/use-quick-actions";
import { AnnouncementFeed } from "../../announcements/components/announcement-feed";
import { useActionInboxSummary } from "../../inbox/use-action-inbox-count";
import { useUnreadCountQuery } from "../../notifications/api";
import { useDashboardData } from "../api";
import { useCheckInBlock } from "../home/blocks/check-in";
import { useCounselorBlock } from "../home/blocks/counselor";
import { useDeputyBlock } from "../home/blocks/deputy";
import { useGateBlock } from "../home/blocks/gate";
import { useHomeroomBlock } from "../home/blocks/homeroom";
import { useLeadershipBlock } from "../home/blocks/leadership";
import { useLibrarianBlock } from "../home/blocks/librarian";
import { usePicketBlock } from "../home/blocks/picket";
import { useStudentBlock } from "../home/blocks/student";
import { useTeacherBlock } from "../home/blocks/teacher";
import { collectBlocks, guardHero, guardTiles, isCalmHero } from "../home/compose";
import { entrance, useFirstEntrance } from "../home/entrance";
import { resolvePersonas } from "../home/personas";
import { buildShortcuts } from "../home/shortcuts";
import {
  isHeroLink,
  type HeroCandidate,
  type Me,
  type PersonaBlock,
  type PersonaKey,
  type ShownHero,
  type TileSpec,
} from "../home/types";
import { useRetryFailedQueries } from "../home/use-retry-failed";

/**
 * Stand-in `Me` while `/v1/me` is still loading. Every persona hook is
 * called unconditionally on every render (rules of hooks), each reading
 * `me.tenant.timezone` or `me.permissions` to build its own query key even
 * while its `active` flag keeps the query disabled, so this needs those
 * fields to exist before the real `me` arrives.
 */
const LOADING_ME = { tenant: { timezone: "UTC" }, permissions: [], duties: [] } as unknown as Me;

/** The notifications count that fills a short stat row (see `notifications` below). */
const NOTIFICATIONS_TILE = "common.notifications";

/** The reader's own check-in card (home/blocks/check-in.tsx), first in the side column. */
const CHECK_IN_SLOT = "checkIn.card";

/**
 * The desktop tile row spreads as many columns as it has tiles. A row is
 * never a single tile: the filler only ever stands beside a persona tile.
 */
const TILE_COLUMNS: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

/** A tile's value as a number when it is a plain count, so it can count up. */
function countable(value: string): number | string {
  return /^\d+$/.test(value) ? Number(value) : value;
}

/**
 * The combined per-role home, one template for every role: the most urgent
 * "now" card across the reader's personas (or a calm one when nothing is
 * due) with exactly one primary action, a compact stat row, the personas'
 * task cards, and announcements. A main column and a side column from
 * `xl`; one column below it, in that order except that the reader's own
 * check-in card comes straight after the figures.
 */
export function DashboardView(): ReactElement {
  useSimulation();
  const { data: me, isLoading, isError, error, refetch } = useDashboardData();
  const t = useTranslations("app.dashboard");
  const tQuick = useTranslations("app.quickActions");
  const format = useFormatter();
  const isDesktop = useIsDesktop();
  const twoColumn = useIsWideTwoColumn();
  const { retrying, retry } = useRetryFailedQueries();

  const personas = me ? resolvePersonas(me) : new Set<PersonaKey>();
  const active = (key: PersonaKey) => personas.has(key);
  const blockMe = me ?? LOADING_ME;

  // Fixed order: the order cards stack in within each column.
  const teacher = useTeacherBlock(blockMe, active("teacher"));
  const student = useStudentBlock(blockMe, active("student"));
  const leadership = useLeadershipBlock(blockMe, active("leadership"));
  const deputy = useDeputyBlock(blockMe, active("deputy"));
  const picket = usePicketBlock(blockMe, active("picket"));
  const counselor = useCounselorBlock(blockMe, active("counselor"));
  const homeroom = useHomeroomBlock(blockMe, active("homeroom"));
  const librarian = useLibrarianBlock(blockMe, active("librarian"));
  const gate = useGateBlock(blockMe, active("gate"));
  const checkIn = useCheckInBlock(blockMe, active("checkIn"));
  const unread = useUnreadCountQuery(Boolean(me));
  const inbox = useActionInboxSummary();
  const quickActions = sortQuickActions(useQuickActions());

  // Personal check-in leads the side column: it is the reader's own task
  // twice a day, ahead of the context cards the personas add.
  const personaBlocks = [
    checkIn,
    teacher,
    student,
    leadership,
    deputy,
    picket,
    counselor,
    homeroom,
    librarian,
    gate,
  ];

  // The stagger and the count-up play on the first visit only.
  const firstEntrance = useFirstEntrance(
    Boolean(me) && !personaBlocks.some((block) => block.pending === true),
  );

  if (isError) {
    return (
      <AppPage variant="wide" title={t("title")} nav={false}>
        <QueryError retry={() => refetch()} error={error} />
      </AppPage>
    );
  }

  if (isLoading || !me) {
    return (
      <AppPage variant="wide" header={false} nav={false} documentTitle={t("title")}>
        <Skeleton className="h-14 w-60" aria-busy="true" />
        <HomeSkeleton />
      </AppPage>
    );
  }

  const access = navAccessFromMe(me);
  const canOpen = (href: string) => canOpenPath(href, access);

  // Notifications never depend on an active persona: it is the filler tile
  // (priority 0) that rounds out a short stat row. On its own it would only
  // repeat the header bell, so a home without persona tiles has no row.
  const notifications: PersonaBlock = {
    tiles: [
      {
        key: NOTIFICATIONS_TILE,
        priority: 0,
        label: t("tiles.notifications.label"),
        value: String(unread.data?.count ?? 0),
        hint: t("tiles.notifications.hint"),
        href: "/notifications",
        icon: Bell,
        tone: "purple",
      },
    ],
    main: [],
    side: [],
  };

  const collected = collectBlocks([...personaBlocks, notifications]);
  const merged = guardTiles(collected.tiles, canOpen);
  // The filler only rounds out the desktop tile row. On a phone's strip it
  // would take a row of its own (figures sit two to a row) to repeat the
  // count the header bell already shows.
  const shown = isDesktop ? merged : merged.filter((tile) => tile.key !== NOTIFICATIONS_TILE);
  const tiles = shown.some((tile) => tile.key !== NOTIFICATIONS_TILE) ? shown : [];

  // The reader's own check-in leads the side column beside the queue; in
  // one column it comes straight after the figures, ahead of the queue
  // and the insight cards, instead of two thirds down the page.
  const checkInSlot = collected.side.find((slot) => slot.key === CHECK_IN_SLOT);
  const contextSlots = collected.side.filter((slot) => slot.key !== CHECK_IN_SLOT);
  // A main column that no queue card leads (a picket teacher's empty queue
  // is dropped, the gate adds none) takes the context cards, so it is not
  // the hero and tiles beside a long side column. When it is still empty,
  // the announcements close it instead of the side column.
  const shortMain = collected.main.length <= 1;
  const mainSlots = shortMain ? [...collected.main, ...contextSlots] : collected.main;
  const sideSlots = shortMain ? [] : contextSlots;
  const announcementsInMain = mainSlots.length === 0;
  const fallback: HeroCandidate =
    inbox.total > 0
      ? {
          key: "common.inbox",
          priority: 0,
          eyebrow: t("fallback.inboxEyebrow"),
          title: t("fallback.inboxTitle", { count: inbox.total }),
          meta: t("fallback.inboxMeta"),
          action: { label: t("fallback.inboxAction"), href: "/inbox" },
        }
      : {
          key: "common.idle",
          priority: 0,
          tone: "neutral",
          eyebrow: t("fallback.eyebrow"),
          title: t("fallback.title"),
          meta: t("fallback.meta"),
          action: { label: t("fallback.action"), href: "/notifications" },
        };
  const candidate = collected.hero ?? fallback;
  // A block whose reads failed contributed nothing, so a calm hero (or the
  // fallback) would read as a false all-clear above the error boxes: say
  // what happened instead, with one retry for every failed read. An urgent
  // hero from a block that did load keeps its place (audit shell-home-3).
  // The inbox fallback with items waiting is real work, not an all-clear.
  const calm = candidate === fallback ? inbox.total === 0 : isCalmHero(candidate);
  const hero: ShownHero =
    (collected.failed || inbox.isError) && calm
      ? {
          key: "common.failed",
          priority: 0,
          tone: "warning",
          eyebrow: t("failed.eyebrow"),
          title: t("failed.title"),
          meta: t("failed.meta"),
          action: {
            label: t("failed.action"),
            loading: retrying,
            onClick: retry,
          },
        }
      : guardHero(candidate, canOpen);

  const shortcuts = buildShortcuts({
    me,
    hero,
    canOpen,
    hasCheckInCard: checkIn.side.length > 0,
    quick: quickActions.map((action) => ({
      key: action.id,
      href: quickActionHref(action),
      label: tQuick(`actions.${action.labelKey}`),
      icon: <action.icon />,
      tone: QUICK_ACTION_TONE[action.id],
    })),
    extra: {
      monitor: t("shortcuts.monitor"),
      setup: t("shortcuts.setup"),
    },
  });

  const announcementsOn = isModuleEnabled(me, "announcements");
  const firstName = me.name.trim().split(/\s+/)[0] ?? me.name;

  return (
    // The home runs wide (dashboards and their tile rows). The greeting is
    // the page title and the date its eyebrow; the reader's roles and
    // school year live in the account menu. The tab reads "Beranda".
    <AppPage
      variant="wide"
      nav={false}
      documentTitle={t("title")}
      eyebrow={format.dateTime(businessNow(), {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: me.tenant.timezone,
      })}
      title={<span className="block truncate">{t("greeting", { name: firstName })}</span>}
    >
      {/* Two columns from xl only, the side one a fixed usable width and the
          main one the rest: at lg an 8/4 split beside the open sidebar left
          the side column about 228px, truncating the shortcuts and wrapping
          the stat tiles (audit shell-home-5). */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-6">
        <div className="flex min-w-0 flex-col gap-4" data-testid="dashboard-main">
          {collected.pending ? (
            <HomeSkeleton tiles={Math.max(tiles.length, 2)} strip={!isDesktop} />
          ) : (
            <>
              <HomeHero hero={hero} enter={firstEntrance} />
              {tiles.length > 0 && (
                <StatGrid
                  variant={isDesktop ? "tiles" : "strip"}
                  aria-label={t("statsLabel")}
                  className={cn(
                    entrance(firstEntrance, 1).className,
                    isDesktop && TILE_COLUMNS[Math.min(tiles.length, 4)],
                  )}
                  style={entrance(firstEntrance, 1).style}
                  data-testid="dashboard-tiles"
                >
                  {tiles.map((tile) => (
                    <HomeStat key={tile.key} tile={tile} countUp={firstEntrance} />
                  ))}
                </StatGrid>
              )}
            </>
          )}
          {checkInSlot && !twoColumn && (
            <div data-testid={`dashboard-card-${checkInSlot.key}`} {...entrance(firstEntrance, 2)}>
              {checkInSlot.node}
            </div>
          )}
          {mainSlots.map((slot, index) => (
            <div
              key={slot.key}
              data-testid={`dashboard-card-${slot.key}`}
              {...entrance(firstEntrance, (checkInSlot && !twoColumn ? 3 : 2) + index)}
            >
              {slot.node}
            </div>
          ))}
          {announcementsOn && announcementsInMain && <AnnouncementsCard />}
        </div>

        <div className="flex min-w-0 flex-col gap-4" data-testid="dashboard-side">
          {checkInSlot && twoColumn && (
            <div data-testid={`dashboard-card-${checkInSlot.key}`}>{checkInSlot.node}</div>
          )}
          {sideSlots.map((slot) => (
            <div key={slot.key} data-testid={`dashboard-card-${slot.key}`}>
              {slot.node}
            </div>
          ))}
          {shortcuts.length > 0 && (
            // The phone has the same actions one tap away on the floating
            // quick-action button, so the card is for wider screens. The
            // bottom padding keeps the last icon off the card's edge, as on
            // the circulation desk's shortcuts.
            <Card className="hidden pb-2 md:block" data-testid="dashboard-card-shortcuts">
              <CardHeader>
                <CardTitle as="h2">{t("shortcuts.title")}</CardTitle>
              </CardHeader>
              <List variant="inset">
                {shortcuts.map((shortcut) => (
                  <ListRow
                    key={shortcut.key}
                    href={shortcut.href}
                    leading={
                      <IconCircle tone={shortcut.tone} size="sm">
                        {shortcut.icon}
                      </IconCircle>
                    }
                    title={shortcut.label}
                    titleLines={2}
                  />
                ))}
              </List>
            </Card>
          )}
          {announcementsOn && !announcementsInMain && <AnnouncementsCard />}
        </div>
      </div>
    </AppPage>
  );
}

/** The latest three announcements; it closes whichever column has room. */
function AnnouncementsCard(): ReactElement {
  const t = useTranslations("app.dashboard");
  return (
    <Card data-testid="dashboard-card-announcements">
      <CardHeader action={<TextLink href="/announcements">{t("openAnnouncements")}</TextLink>}>
        <CardTitle as="h2">{t("announcementsTitle")}</CardTitle>
      </CardHeader>
      <AnnouncementFeed limit={3} compact />
    </Card>
  );
}

function HomeHero({ hero, enter }: { hero: ShownHero; enter: boolean }): ReactElement {
  return (
    <HeroCard
      {...entrance(enter, 0)}
      data-testid="dashboard-hero"
      tone={hero.tone}
      eyebrow={hero.eyebrow}
      title={hero.title}
      meta={hero.meta}
      chip={hero.chip}
      live={hero.live}
      action={
        hero.action &&
        (isHeroLink(hero.action) ? (
          <Button asChild className="w-full sm:w-auto">
            <Link href={hero.action.href}>{hero.action.label}</Link>
          </Button>
        ) : (
          <Button
            className="w-full sm:w-auto"
            icon={<RotateCw />}
            loading={hero.action.loading}
            onClick={hero.action.onClick}
          >
            {hero.action.label}
          </Button>
        ))
      }
      secondaryAction={
        hero.secondaryAction && (
          <TextLink href={hero.secondaryAction.href}>{hero.secondaryAction.label}</TextLink>
        )
      }
    >
      {hero.progress && (
        <Progress
          className="mt-1"
          variant="meter"
          value={hero.progress.value}
          max={hero.progress.max}
          label={hero.progress.label}
          valueLabel={hero.progress.valueLabel}
        />
      )}
    </HeroCard>
  );
}

function HomeStat({ tile, countUp }: { tile: TileSpec; countUp: boolean }): ReactElement {
  const Icon = tile.icon;
  return (
    <Stat
      data-testid={`dashboard-tile-${tile.key}`}
      icon={<Icon />}
      tone={tile.tone}
      value={countable(tile.value)}
      label={tile.label}
      hint={tile.hint}
      href={tile.href}
      countUp={countUp}
    />
  );
}

/**
 * The hero and stat row's place while the personas' first answers load, so
 * nothing jumps. Like the route's loading screen it stays invisible for the
 * first 200ms and then fades in, so a short wait never flashes a skeleton.
 */
function HomeSkeleton({ tiles = 4, strip = false }: { tiles?: number; strip?: boolean }) {
  return (
    <div
      className="flex animate-fade-in flex-col gap-4 [animation-delay:var(--duration-base)]"
      aria-busy="true"
      data-testid="dashboard-skeleton"
    >
      <Skeleton className="h-44 w-full rounded-xl" />
      {strip ? (
        <Skeleton className="h-16 w-full rounded-lg" />
      ) : (
        <div className={cn("grid grid-cols-2 gap-3", TILE_COLUMNS[Math.min(tiles, 4)])}>
          {Array.from({ length: Math.min(tiles, 4) }, (_, index) => (
            <Skeleton key={index} className="h-26 w-full rounded-lg" />
          ))}
        </div>
      )}
    </div>
  );
}
