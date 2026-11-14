"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  List,
  ListRow,
  SkeletonList,
  TextLink,
} from "@newsekolah/ui";
import { ArrowDownToLine, ArrowUpFromLine, BookCheck, BookX, DoorOpen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../../components/query-error";
import { isModuleEnabled } from "../../../../lib/modules/feature-modules";
import { todayInZone } from "../../../../lib/tenant-date";
import type { LibraryLoan } from "../../../library/api";
import { LibraryTitleName } from "../../../library/components/library-title-name";
import { useLibraryDashboardQuery } from "../../../library/dashboard-api";
import {
  EMPTY_BLOCK,
  HERO_PRIORITY,
  type BlockSlot,
  type Me,
  type PersonaBlock,
  type TileSpec,
} from "../types";

const CIRCULATION_DESK_HREF = "/library/desk";
const LIBRARY_HREF = "/library";
const VISITS_HREF = "/library/visits";

const DAY_MS = 86_400_000;

/**
 * The librarian (`manage_library_circulation`): today's circulation as the
 * hero and the tiles, and the longest-overdue loans as the task card, from
 * `GET /v1/library/dashboard` (`features/library/dashboard-api.ts`).
 */
export function useLibrarianBlock(me: Me, active: boolean): PersonaBlock {
  const t = useTranslations("app.dashboardSchool.librarian");
  const libraryOn = isModuleEnabled(me, "library");
  const { data, isLoading, isError, error, refetch } = useLibraryDashboardQuery(
    active && libraryOn,
  );

  if (!active || !libraryOn) return EMPTY_BLOCK;

  const summary = !isLoading && !isError ? data?.summary : undefined;

  const hero = summary
    ? {
        key: "library.circulation",
        priority: HERO_PRIORITY.circulation,
        tone: summary.overdue > 0 ? ("accent-soft" as const) : ("neutral" as const),
        eyebrow: t("hero.eyebrow"),
        title: t("hero.title", { loans: summary.loans_today, returns: summary.returns_today }),
        meta:
          summary.overdue > 0 ? t("hero.meta", { overdue: summary.overdue }) : t("hero.metaClear"),
        action: { label: t("hero.action"), href: CIRCULATION_DESK_HREF },
        secondaryAction: { label: t("hero.overviewAction"), href: LIBRARY_HREF },
      }
    : undefined;

  const tiles: TileSpec[] = summary
    ? [
        {
          key: "library.overdue",
          priority: 66,
          label: t("tile"),
          value: String(summary.overdue),
          icon: BookX,
          tone: "red",
          href: CIRCULATION_DESK_HREF,
        },
        {
          key: "library.loansToday",
          priority: 65,
          label: t("tiles.loansToday"),
          value: String(summary.loans_today),
          icon: ArrowUpFromLine,
          tone: "amber",
        },
        {
          key: "library.returnsToday",
          priority: 64,
          label: t("tiles.returnsToday"),
          value: String(summary.returns_today),
          icon: ArrowDownToLine,
          tone: "green",
        },
        {
          key: "library.visitsToday",
          priority: 63,
          label: t("tiles.visitsToday"),
          value: String(summary.visits_today),
          icon: DoorOpen,
          tone: "blue",
          href: VISITS_HREF,
        },
      ]
    : [];

  const main: BlockSlot[] = [
    {
      key: "library.overdue",
      node: (
        <OverdueCard
          key="library.overdue"
          today={todayInZone(me.tenant.timezone)}
          isLoading={isLoading}
          error={isError ? error : null}
          refetch={refetch}
          loans={data?.longest_overdue}
        />
      ),
    },
  ];

  return { hero, tiles, main, side: [], pending: isLoading };
}

function OverdueCard({
  today,
  isLoading,
  error,
  refetch,
  loans,
}: {
  today: string;
  isLoading: boolean;
  error: unknown;
  refetch: () => unknown;
  loans: LibraryLoan[] | undefined;
}): ReactElement {
  const t = useTranslations("app.dashboardSchool.librarian.overdue");
  const locale = useLocale() as Locale;

  return (
    <Card>
      <CardHeader action={<TextLink href={CIRCULATION_DESK_HREF}>{t("action")}</TextLink>}>
        <CardTitle as="h2">{t("title")}</CardTitle>
      </CardHeader>
      {error ? (
        <div className="px-5 pb-5">
          <QueryError retry={refetch} error={error} />
        </div>
      ) : isLoading || !loans ? (
        <div className="px-5 pb-5">
          <SkeletonList rows={3} framed={false} />
        </div>
      ) : loans.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState variant="compact" icon={<BookCheck />} title={t("empty")} />
        </div>
      ) : (
        <List>
          {loans.slice(0, 5).map((loan) => {
            const lateDays = Math.round((Date.parse(today) - Date.parse(loan.due_on)) / DAY_MS);
            return (
              <ListRow
                key={loan.id}
                title={<LibraryTitleName titleId={loan.title_id} />}
                meta={t("due", { date: formatDate(loan.due_on, { locale }) })}
                trailing={
                  lateDays > 0 ? (
                    <Badge tone="danger" size="sm">
                      {t("late", { days: lateDays })}
                    </Badge>
                  ) : undefined
                }
              />
            );
          })}
        </List>
      )}
    </Card>
  );
}
