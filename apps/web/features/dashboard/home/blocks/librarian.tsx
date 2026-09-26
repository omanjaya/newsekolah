"use client";

import type { Locale } from "@newsekolah/i18n";
import { formatDate } from "@newsekolah/i18n";
import { Card, CardHeader, CardTitle, Skeleton } from "@newsekolah/ui";
import { BookX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactElement } from "react";

import { QueryError } from "../../../../components/query-error";
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

/**
 * The librarian (`manage_library_circulation`): today's circulation counts
 * and the longest-overdue loans, from `GET /v1/library/dashboard` --
 * `features/library/dashboard-api.ts`'s existing hook, unchanged besides
 * the new optional `enabled` flag this persona needs to skip the request
 * when the librarian block is inactive.
 */
export function useLibrarianBlock(_me: Me, active: boolean): PersonaBlock {
  const t = useTranslations("app.dashboardSchool.librarian");
  const { data, isLoading, isError, refetch } = useLibraryDashboardQuery(active);

  if (!active) return EMPTY_BLOCK;

  const ready = !isLoading && !isError && Boolean(data);

  const hero =
    ready && data
      ? {
          key: "library.circulation",
          priority: HERO_PRIORITY.circulation,
          eyebrow: t("hero.eyebrow"),
          title: t("hero.title", {
            loans: data.summary.loans_today,
            returns: data.summary.returns_today,
          }),
          meta: t("hero.meta", { overdue: data.summary.overdue }),
          action: { label: t("hero.action"), href: CIRCULATION_DESK_HREF },
        }
      : undefined;

  const tiles: TileSpec[] =
    ready && data
      ? [
          {
            key: "library.overdue",
            priority: 65,
            label: t("tile"),
            value: String(data.summary.overdue),
            icon: BookX,
            tone: "red",
            href: CIRCULATION_DESK_HREF,
          },
        ]
      : [];

  const right: BlockSlot[] = [
    {
      key: "library.overdue",
      node: (
        <OverdueCard
          key="library.overdue"
          isLoading={isLoading}
          isError={isError}
          refetch={refetch}
          loans={data?.longest_overdue}
        />
      ),
    },
  ];

  return { hero, tiles, left: [], right };
}

function OverdueCard({
  isLoading,
  isError,
  refetch,
  loans,
}: {
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
  loans: LibraryLoan[] | undefined;
}): ReactElement {
  const t = useTranslations("app.dashboardSchool.librarian.overdue");
  const locale = useLocale() as Locale;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <div className="px-5 pb-5">
        {isError ? (
          <QueryError retry={refetch} />
        ) : isLoading || !loans ? (
          <Skeleton className="h-24 w-full" aria-busy="true" />
        ) : loans.length === 0 ? (
          <p className="text-[13px] text-fg-muted">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {loans.slice(0, 5).map((loan) => (
              <li key={loan.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-fg">
                  <LibraryTitleName titleId={loan.title_id} />
                </span>
                <span className="shrink-0 text-fg-muted">
                  {formatDate(loan.due_on, { locale })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
