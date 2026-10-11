"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  HeroCard,
  Skeleton,
  StatTile,
} from "@newsekolah/ui";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../components/query-error";
import { bentoCells, tileColumns } from "../../../lib/layout/bento";
import { businessNow, useSimulation } from "../../../lib/simulation/clock";
import { AnnouncementFeed } from "../../announcements/components/announcement-feed";
import { useUnreadCountQuery } from "../../notifications/api";
import { useDashboardData } from "../api";
import { useCheckInBlock } from "../home/blocks/check-in";
import { useCounselorBlock } from "../home/blocks/counselor";
import { useHomeroomBlock } from "../home/blocks/homeroom";
import { useLeadershipBlock } from "../home/blocks/leadership";
import { useLibrarianBlock } from "../home/blocks/librarian";
import { usePicketBlock } from "../home/blocks/picket";
import { useStudentBlock } from "../home/blocks/student";
import { useTeacherBlock } from "../home/blocks/teacher";
import { collectBlocks } from "../home/compose";
import { resolvePersonas } from "../home/personas";
import type { Me, PersonaBlock, PersonaKey } from "../home/types";

/**
 * Stand-in `Me` while `/v1/me` is still loading. Every persona hook is
 * called unconditionally on every render (rules of hooks), each reading
 * `me.tenant.timezone` or `me.permissions` to build its own query key even
 * while its `active` flag keeps the query disabled, so this needs those
 * fields to exist before the real `me` arrives.
 */
const LOADING_ME = { tenant: { timezone: "UTC" }, permissions: [], duties: [] } as unknown as Me;

/**
 * The combined per-role home: every persona the signed-in user holds
 * stacks its own block, the most urgent hero and the top four stat tiles
 * across all of them win the fold. Replaces the single permission-driven
 * view (docs/superpowers/plans/2026-09-26-dashboard-per-peran.md Task 7).
 */
export function DashboardView(): ReactElement {
  useSimulation();
  const { data: me, isLoading, isError, refetch } = useDashboardData();
  const t = useTranslations("app.dashboard");
  const format = useFormatter();

  const personas = me ? resolvePersonas(me) : new Set<PersonaKey>();
  const active = (key: PersonaKey) => personas.has(key);
  const blockMe = me ?? LOADING_ME;

  // Fixed order per the plan: teacher, check-in, homeroom, student, leadership,
  // picket, counselor, librarian. Left/right slots render in this order.
  const teacher = useTeacherBlock(blockMe, active("teacher"));
  const checkIn = useCheckInBlock(blockMe, active("checkIn"));
  const homeroom = useHomeroomBlock(blockMe, active("homeroom"));
  const student = useStudentBlock(blockMe, active("student"));
  const leadership = useLeadershipBlock(blockMe, active("leadership"));
  const picket = usePicketBlock(blockMe, active("picket"));
  const counselor = useCounselorBlock(blockMe, active("counselor"));
  const librarian = useLibrarianBlock(blockMe, active("librarian"));
  const unread = useUnreadCountQuery(Boolean(me));

  if (isError) return <QueryError retry={() => refetch()} className="m-4" />;

  if (isLoading || !me) {
    return (
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4 p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-36 w-full" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Skeleton className="h-[104px] w-full" />
          <Skeleton className="h-[104px] w-full" />
          <Skeleton className="h-[104px] w-full" />
          <Skeleton className="h-[104px] w-full" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  // Notifications never depend on an active persona: it is the guaranteed
  // filler tile (priority 0) so the tile row is never empty.
  const notifications: PersonaBlock = {
    tiles: [
      {
        key: "common.notifications",
        priority: 0,
        label: t("tiles.notifications.label"),
        value: String(unread.data?.count ?? 0),
        hint: t("tiles.notifications.hint"),
        href: "/notifications",
        icon: Bell,
        tone: "purple",
      },
    ],
    left: [],
    right: [],
  };

  const { hero, tiles, left, right } = collectBlocks([
    teacher,
    checkIn,
    homeroom,
    student,
    leadership,
    picket,
    counselor,
    librarian,
    notifications,
  ]);

  const tileGrid = tileColumns(tiles.length);
  const cards = bentoCells([
    ...left,
    ...right,
    {
      key: "announcements",
      node: (
        <Card className="h-full">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>{t("announcementsTitle")}</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/announcements">{t("openAnnouncements")}</Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <AnnouncementFeed limit={3} compact />
          </CardContent>
        </Card>
      ),
    },
  ]);

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 pb-1">
        <div className="min-w-0">
          <p className="mb-1 text-[12px] text-fg-muted">
            {t("title")} ·{" "}
            {format.dateTime(businessNow(), {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: me.tenant.timezone,
            })}
          </p>
          <h1 className="font-heading text-[28px] font-bold tracking-tight text-fg">
            {t("greeting", { name: me.name })}
          </h1>
        </div>
        <div className="flex items-center gap-3 md:flex-col md:items-end md:gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            {me.roles.map((role) => (
              <Badge key={role.id} variant="neutral">
                {role.name}
              </Badge>
            ))}
          </div>
          <p className="text-[12px] text-fg-muted">
            {me.active_academic_year?.label ?? t("noAcademicYear")}
          </p>
        </div>
      </header>

      {hero && (
        <HeroCard
          eyebrow={hero.eyebrow}
          title={hero.title}
          meta={hero.meta}
          chip={hero.chip}
          action={
            hero.action && (
              <Button asChild>
                <Link href={hero.action.href}>{hero.action.label}</Link>
              </Button>
            )
          }
        />
      )}

      <div className={tileGrid.container} data-testid="dashboard-tiles">
        {tiles.map((tile, index) => {
          const isLast = index === tiles.length - 1;
          const content = (
            <StatTile
              className="h-full"
              icon={tile.icon}
              tone={tile.tone}
              value={tile.value}
              label={tile.label}
              hint={tile.hint}
            />
          );
          return (
            <div
              key={tile.key}
              data-testid={`dashboard-tile-${tile.key}`}
              className={cn("h-full", isLast && tileGrid.lastTileClassName)}
            >
              {tile.href ? (
                <Link
                  href={tile.href}
                  className="block h-full rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {content}
                </Link>
              ) : (
                content
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2" data-testid="dashboard-cards">
        {cards.map((cell) => (
          <div
            key={cell.key}
            data-testid={`dashboard-card-${cell.key}`}
            className={cn("flex flex-col", cell.span === "full" && "lg:col-span-2")}
          >
            <div className="flex-1">{cell.node}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
